import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchDuckDuckGo } from '../engines/duckduckgo.js';
import { searchSogou } from '../engines/sogou.js';
import { searchBing } from '../engines/bing.js';
import { searchBaidu } from '../engines/baidu.js';
import { BraveProvider } from '../engines/brave.js';
import { TavilyProvider } from '../engines/tavily.js';
import { searchExa } from '../engines/exa.js';
import { searchYouCom } from '../engines/youcom.js';
import { isEngineAdapterError } from '../engines/engine-error.js';
import { searchWikipedia } from '../engines/wikipedia.js';
import { searchStartpage } from '../engines/startpage.js';
import { searchYandex } from '../engines/yandex.js';
import { searchMojeek } from '../engines/mojeek.js';
import {
  hasEngineCredential,
  optionalEngineCredentialEnvironment,
} from '../engines/index.js';
import { getSecurityNote } from '../infrastructure/security.js';
import type { SearchResult, SearchProvider, EngineError } from '../types.js';
import {
  detectLanguage,
  enrichResults,
  createSearchEvidenceEvaluator,
  expandQuery,
  filterLowQuality,
  formatResults,
  generateChineseVariants,
  getProviderFamily,
  hasChinese,
  semanticDedup,
  semanticRerank,
  type ConfidenceBasketResult,
  type ScoredResult,
  type SearchEvidenceEvaluation,
} from '../aggregation/index.js';
import type { FormatOptions } from '../aggregation/format.js';
import {
  createSearchToolResult,
  searchOutputSchema,
} from './search-output.js';
import { SearchCache, logger, HealthTracker, RateLimiter, loadConfig, EnginePolicy, ServerMetrics, abortableDelay } from '../infrastructure/index.js';

const FREE_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu', 'wikipedia', 'startpage', 'yandex', 'mojeek'];
const PAID_ENGINES: SearchProvider[] = ['brave', 'tavily', 'exa', 'youcom'];

// Engine weights (higher = more trusted)
const ENGINE_WEIGHTS: Record<string, number> = {
  duckduckgo: 0.85,
  sogou: 0.8,
  bing: 0.9,
  baidu: 0.75,
  wikipedia: 0.93,
  startpage: 0.86,
  yandex: 0.82,
  mojeek: 0.8,
  brave: 0.95,
  tavily: 0.9,
  exa: 0.92,
  youcom: 0.91,
};

// Infrastructure singletons
const cache = new SearchCache();
const healthTracker = new HealthTracker();
const serverMetrics = new ServerMetrics(cache);
const rateLimiter = new RateLimiter();
const config = loadConfig();
const enginePolicy = new EnginePolicy(config.ALLOWED_ENGINES, config.DENIED_ENGINES);

function isSemanticRoutingEnabled(): boolean {
  return config.semanticDedup || config.semanticRerank;
}

/** Group adapters by upstream provider while preserving caller preference. */
function getProviderChains(engines: SearchProvider[]): SearchProvider[][] {
  const chains = new Map<string, SearchProvider[]>();
  for (const engine of engines) {
    const provider = getProviderFamily(engine);
    const chain = chains.get(provider) ?? [];
    if (!chain.includes(engine)) chain.push(engine);
    chains.set(provider, chain);
  }
  return [...chains.values()];
}

/**
 * Search a single engine with health check, rate limiting, and retry logic.
 */
async function searchEngine(
  engine: SearchProvider,
  query: string,
  limit: number,
  maxRetries: number = 2,
  signal?: AbortSignal,
): Promise<EngineOutcome> {
  signal?.throwIfAborted();
  // Skip engines blocked by policy
  if (!enginePolicy.isAllowed(engine)) {
    logger.info({ engine }, 'Engine blocked by policy');
    return { engine, status: 'skipped', results: [] };
  }

  // Skip unhealthy providers
  if (!healthTracker.isHealthy(engine)) {
    logger.warn({ engine }, 'Skipping unhealthy provider');
    return { engine, status: 'skipped', results: [] };
  }

  // Rate limit before making the request
  await rateLimiter.waitForSlot(engine, signal);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    try {
      let results: SearchResult[];
      const engineOptions = { signal, throwOnError: true };
      switch (engine) {
        case 'duckduckgo':
          results = await searchDuckDuckGo(query, limit, engineOptions);
          break;
        case 'sogou':
          results = await searchSogou(query, limit, engineOptions);
          break;
        case 'bing':
          results = await searchBing(query, limit, engineOptions);
          break;
        case 'baidu':
          results = await searchBaidu(query, limit, engineOptions);
          break;
        case 'wikipedia':
          results = await searchWikipedia(query, limit, engineOptions);
          break;
        case 'startpage':
          results = await searchStartpage(query, limit, engineOptions);
          break;
        case 'yandex':
          results = await searchYandex(query, limit, engineOptions);
          break;
        case 'mojeek':
          results = await searchMojeek(query, limit, engineOptions);
          break;
        case 'brave':
          results = await new BraveProvider().search(query, limit, engineOptions);
          break;
        case 'tavily':
          results = await new TavilyProvider().search(query, limit, engineOptions);
          break;
        case 'exa':
          results = await searchExa({
            query,
            count: limit,
            apiKey: process.env.EXA_API_KEY || '',
            signal,
            throwOnError: true,
          });
          break;
        case 'youcom':
          results = await searchYouCom(query, limit, engineOptions);
          break;
        default:
          return { engine, status: 'skipped', results: [] };
      }
      signal?.throwIfAborted();
      const latency = Date.now() - startTime;
      healthTracker.recordSuccess(engine, latency);
      logger.info({ engine, latency, count: results.length, attempt }, 'Search completed');
      return { engine, status: 'success', results };
    } catch (err) {
      signal?.throwIfAborted();
      lastError = err instanceof Error ? err : new Error(String(err));
      const latency = Date.now() - startTime;

      // Check if this is a retryable error (network, timeout, 5xx)
      const isRetryable = isRetryableError(lastError);

      if (attempt < maxRetries && isRetryable) {
        // Exponential backoff: 500ms, 1000ms, 2000ms...
        const delay = Math.min(500 * Math.pow(2, attempt), 5000);
        logger.warn({ engine, attempt, delay, err: lastError.message }, 'Retryable error, retrying...');
        await abortableDelay(delay, signal);
        continue;
      }

      // Non-retryable or max retries exceeded
      if (isEngineAdapterError(lastError) && lastError.cooldownMs) {
        healthTracker.suspend(engine, lastError.cooldownMs);
      } else {
        healthTracker.recordFailure(engine);
      }
      logger.error({ engine, latency, attempt, err: lastError.message }, 'Search failed');
      return { engine, status: 'failed', results: [], error: lastError };
    }
  }

  // All retries exhausted
  logger.error({ engine, lastError: lastError?.message }, 'All retries exhausted');
  return {
    engine,
    status: 'failed',
    results: [],
    error: lastError ?? new Error('All retries exhausted'),
  };
}

interface EngineOutcome {
  engine: SearchProvider;
  status: 'success' | 'skipped' | 'failed';
  results: SearchResult[];
  error?: Error;
}

/**
 * Check if an error is retryable (network, timeout, 5xx).
 */
function isRetryableError(err: Error): boolean {
  if ((err as Error & { retryable?: boolean }).retryable === false) {
    return false;
  }
  const msg = err.message.toLowerCase();
  
  // Network errors
  if (msg.includes('econnreset') || msg.includes('econnrefused') || 
      msg.includes('etimedout') || msg.includes('network')) {
    return true;
  }
  
  // Timeout
  if (msg.includes('timeout') || msg.includes('abort')) {
    return true;
  }
  
  // HTTP 5xx errors (but not 501 Not Implemented)
  if (msg.includes('http 5') && !msg.includes('http 501')) {
    return true;
  }
  
  return false;
}

/**
 * Classify a raw error into a structured EngineError for agent-friendly recovery.
 */
function classifyEngineError(engine: string, err: Error): EngineError {
  if (isEngineAdapterError(err)) {
    return {
      engine,
      type: err.failureType,
      message: err.message,
      suggestion: err.suggestion,
    };
  }
  const msg = err.message.toLowerCase();

  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('etimedout')) {
    return { engine, type: 'timeout', message: err.message, suggestion: 'Retry with a shorter query or try again later' };
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return { engine, type: 'permission_denied', message: err.message, suggestion: 'Check API key configuration' };
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return { engine, type: 'rate_limited', message: err.message, suggestion: 'Retry in 30s or reduce request rate' };
  }
  if (msg.includes('http 4') || msg.includes('400') || msg.includes('404')) {
    return { engine, type: 'upstream_4xx', message: err.message, suggestion: 'Check query syntax or try a different engine' };
  }
  if (msg.includes('http 5') || msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return { engine, type: 'upstream_5xx', message: err.message, suggestion: 'Engine may be temporarily unavailable, retry later' };
  }
  if (msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') || msg.includes('network')) {
    return { engine, type: 'unknown', message: err.message, suggestion: 'Network error — check connectivity or try a different engine' };
  }
  return { engine, type: 'unknown', message: err.message, suggestion: 'Try a different engine or check the query' };
}
function hasApiKey(engine: SearchProvider): boolean {
  return hasEngineCredential(engine);
}

function getMissingCredentialFailures(
  requestedEngines: SearchProvider[] | undefined,
): EngineError[] {
  if (!requestedEngines) return [];
  return [...new Set(requestedEngines)]
    .filter(engine => PAID_ENGINES.includes(engine) && !hasApiKey(engine))
    .map(engine => {
      const credentialEnvironment =
        optionalEngineCredentialEnvironment[engine];
      return {
        engine,
        type: 'permission_denied' as const,
        message: `${engine} credential is not configured`,
        suggestion: credentialEnvironment
          ? `Set ${credentialEnvironment} or choose a zero-key engine`
          : 'Configure the provider credential or choose a zero-key engine',
      };
    });
}

// ─── Shared options & response types ────────────────────────────────────
export interface SearchWithFallbackOptions {
  query: string;
  count?: number;
  engines?: SearchProvider[];
  minConfidence?: number;
  minSourceCount?: number;
  language?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  waterfall?: boolean;
  waterfallMinResults?: number;
  waterfallMinConfidence?: number;
  enrich?: boolean;
  enrichMax?: number;
  enrichMinConfidence?: number;
  /** Disable query-expansion recursion for deterministic benchmark capture. */
  expandQueries?: boolean;
  /** Internal request cancellation propagated from the MCP request context. */
  signal?: AbortSignal;
}

type FormattedSearchPayload = ReturnType<typeof formatResults>;

interface SearchResponse {
  query: string;
  engines: SearchProvider[];
  results: FormattedSearchPayload['results'];
  meta: FormattedSearchPayload['meta'] & {
    execution?: {
      mode: 'parallel' | 'waterfall';
      engine_calls: number;
      searched_engines: string[];
      phases_completed: string[];
      early_stop: boolean;
      stop_reason:
        | 'quality_gate_satisfied'
        | 'phases_exhausted';
      quality_gate_stage?: 'pre_semantic' | 'post_semantic';
      quality_gate?: ConfidenceBasketResult;
    };
  };
  security_note: string;
  detected_language?: string;
  rate_limits?: Record<string, { remaining: number; resetInMs: number }>;
  partialFailures?: EngineError[];
  cache_hit?: boolean;
}

// ─── Request collapsing ───────────────────────────────────────────────
// Track in-flight requests to avoid duplicate concurrent calls
const pendingRequests = new Map<string, Promise<SearchResponse>>();

/**
 * Generate cache key for request collapsing.
 */
function makeCollapseKey(options: SearchWithFallbackOptions): string {
  const {
    query, count = 10, engines = [], minConfidence = 0, minSourceCount = 1,
    language = 'auto', includeDomains = [], excludeDomains = [], waterfall = false,
    waterfallMinResults = 3, waterfallMinConfidence = 0.6,
    enrich = false, enrichMax, enrichMinConfidence, expandQueries = true,
  } = options;
  return JSON.stringify({
    query,
    count,
    engines: [...engines].sort(),
    minConfidence,
    minSourceCount,
    language,
    includeDomains: [...includeDomains].sort(),
    excludeDomains: [...excludeDomains].sort(),
    waterfall,
    waterfallMinResults,
    waterfallMinConfidence,
    enrich,
    enrichMax,
    enrichMinConfidence,
    expandQueries,
  });
}

function makeSearchCacheKey(options: SearchWithFallbackOptions): string {
  const count = options.count ?? 10;
  const engines = options.engines ?? ['duckduckgo', 'sogou'];
  return cache.makeKey(makeCollapseKey(options), count, engines);
}

function collectEngineOutcomes(
  settled: PromiseSettledResult<EngineOutcome>[],
  engines: SearchProvider[],
  allResults: SearchResult[],
  failures: EngineError[],
  signal?: AbortSignal,
): void {
  signal?.throwIfAborted();
  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      failures.push(classifyEngineError(engines[index], error));
      return;
    }
    allResults.push(...result.value.results);
    if (result.value.status === 'failed' && result.value.error) {
      failures.push(classifyEngineError(result.value.engine, result.value.error));
    }
  });
}

// ─── Core search logic (fused patterns from ddgs) ──────────────────────

/**
 * Search with provider dedup, batch concurrency, and early exit.
 * 
 * Patterns from ddgs:
 * 1. Provider dedup: same provider only searches once
 * 2. Batch concurrency: search in batches to avoid rate limits
 * 3. Early exit: stop when enough results collected
 * 4. Frequency scoring: count how many engines returned each result
 */
export async function searchWithFallback(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  options.signal?.throwIfAborted();
  const requestedCount = options.count ?? 10;
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) {
    throw new RangeError('count must be an integer between 1 and 50');
  }
  if (options.signal) {
    return executeSearch(options);
  }
  const collapseKey = makeCollapseKey(options);
  
  // Check if same request is already in-flight
  const pending = pendingRequests.get(collapseKey);
  if (pending) {
    logger.info({ query: options.query }, 'Request collapsing: reusing pending request');
    return pending;
  }
  
  // Start new request and track it
  const searchPromise = executeSearch(options);
  pendingRequests.set(collapseKey, searchPromise);

  try {
    return await searchPromise;
  } finally {
    pendingRequests.delete(collapseKey);
  }
}

/**
 * Execute the actual search logic (internal).
 */
async function executeSearch(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  if (options.waterfall) {
    return executeWaterfallSearch(options);
  }
  return executeParallelSearch(options);
}

/**
 * Calculate adaptive concurrency based on engine health and request count.
 *
 * Strategy (ordered by priority):
 * 1. If >50% of engines are unhealthy → reduce to 2 (conservative, avoids
 *    overwhelming failing backends with concurrent requests)
 * 2. If all engines are healthy (no recent failures) → increase to
 *    `min(engines.length, ceil(count / 3))` — aggressive, capitalizes on
 *    fast/reliable backends
 * 3. Base concurrency: `min(engines.length, max(2, ceil(count / 5)))` —
 *    slightly more aggressive than the original formula
 *
 * @param engines  Candidate search engines for the current batch/phase.
 * @param count    Requested result count (drives how many engines to fan out).
 * @returns        Number of engines to search concurrently in one batch.
 */
function calculateAdaptiveConcurrency(engines: SearchProvider[], count: number): number {
  const unhealthyCount = engines.filter(e => !healthTracker.isHealthy(e)).length;
  const unhealthyRatio = engines.length > 0 ? unhealthyCount / engines.length : 0;
  const allHealthy = unhealthyCount === 0;

  const conservativeConcurrency = 2;
  const aggressiveConcurrency = Math.min(engines.length, Math.ceil(count / 3));
  const baseConcurrency = Math.min(engines.length, Math.max(2, Math.ceil(count / 5)));

  if (unhealthyRatio > 0.5) return conservativeConcurrency;
  if (allHealthy) return aggressiveConcurrency;
  return baseConcurrency;
}

function getEffectiveResultThresholds(
  requestedMinConfidence: number,
  requestedMinSourceCount: number,
): { minConfidence: number; minSourceCount: number } {
  if (config.outputStyle !== 'compact') {
    return {
      minConfidence: requestedMinConfidence,
      minSourceCount: requestedMinSourceCount,
    };
  }
  return {
    minConfidence: Math.max(requestedMinConfidence, config.minConfidence),
    minSourceCount: Math.max(requestedMinSourceCount, config.minSourceCount),
  };
}

async function executeParallelSearch(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  const semanticRoutingEnabled = isSemanticRoutingEnabled();
  const {
    query,
    count = 10,
    engines: userEngines = ['duckduckgo', 'sogou'] as SearchProvider[],
    minConfidence = 0,
    minSourceCount = 1,
    language,
    includeDomains,
    excludeDomains,
  } = options;
  const effectiveThresholds = getEffectiveResultThresholds(
    minConfidence,
    minSourceCount,
  );

  const detectedLang = (!language || language === 'auto') ? detectLanguage(query) : language;
  logger.info({ query, detectedLang, explicitLang: language }, 'Language detection');

  // Check cache first
  const cacheKey = makeSearchCacheKey(options);
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query, count, engines: userEngines }, 'Cache hit');
    return { ...(cached as SearchResponse), cache_hit: true } as SearchResponse;
  }

  logger.info({ query, count, engines: userEngines }, 'Starting search');

  // ── Step 1: Provider grouping (from ddgs) ───────────────────────────
  // Query one adapter per family at a time. Additional explicitly selected
  // adapters in that family remain a failure fallback, not a second source.
  const providerChains = getProviderChains(userEngines);
  const uniqueEngines = providerChains.map(chain => chain[0]);
  logger.info({ engines: uniqueEngines }, 'After provider dedup');

  // ── Step 2: Determine which engines to search ───────────────────────
  // Explicit engine selection is authoritative in both parallel and waterfall
  // modes. Do not silently fan out to every free adapter.
  const freeProviderChains = providerChains
    .map(chain => chain.filter(engine => FREE_ENGINES.includes(engine)))
    .filter(chain => chain.length > 0);
  const optionalProviderChains = providerChains
    .map(chain => chain.filter(
      engine => PAID_ENGINES.includes(engine) && hasApiKey(engine),
    ))
    .filter(chain => chain.length > 0);
  const phase1Engines = freeProviderChains.map(chain => chain[0]);
  const paidToSearch = optionalProviderChains.map(chain => chain[0]);
  const providerChainByPrimary = new Map(
    [...freeProviderChains, ...optionalProviderChains]
      .map(chain => [chain[0], chain] as const),
  );

  // ── Step 3: Batch concurrency + early exit (from ddgs) ──────────────
  const BATCH_SIZE = calculateAdaptiveConcurrency(phase1Engines, count);
  const allResults: SearchResult[] = [];
  const failures: EngineError[] = getMissingCredentialFailures(userEngines);
  const searchedEngines: string[] = [];
  let parallelEvaluation: SearchEvidenceEvaluation | undefined;
  let parallelGate: ConfidenceBasketResult | undefined;
  let preparedSemanticResults: ScoredResult[] | undefined;
  let stoppedEarly = false;
  let freePhaseAttempted = false;
  let optionalPhaseAttempted = false;
  const requestedProviderFamilies = new Set(
    uniqueEngines.map(getProviderFamily),
  ).size;
  const requiredProviderFamilies = Math.min(2, Math.max(requestedProviderFamilies, 1));
  const evidenceEvaluator = createSearchEvidenceEvaluator({
    query,
    engineWeights: ENGINE_WEIGHTS,
    minConfidence: effectiveThresholds.minConfidence,
    minSourceCount: effectiveThresholds.minSourceCount,
    includeDomains,
    excludeDomains,
    qualityGate: {
      minResults: Math.min(count, 3),
      minAvgConfidence: 0.6,
      minProviderFamilies: requiredProviderFamilies,
      topK: 5,
    },
  });
  const searchProviderChain = async (
    primary: SearchProvider,
    limit: number,
  ): Promise<EngineOutcome[]> => {
    const chain = providerChainByPrimary.get(primary) ?? [primary];
    const outcomes: EngineOutcome[] = [];
    for (const engine of chain) {
      searchedEngines.push(engine);
      const outcome = await searchEngine(engine, query, limit, 2, options.signal);
      outcomes.push(outcome);
      if (
        outcome.status === 'success'
        && filterLowQuality(outcome.results).length > 0
      ) {
        break;
      }
      logger.info(
        { engine, providerFamily: getProviderFamily(engine), next: chain[outcomes.length] },
        'Provider adapter produced no usable results; trying same-family fallback',
      );
    }
    return outcomes;
  };
  const collectProviderChainOutcomes = (
    settled: PromiseSettledResult<EngineOutcome[]>[],
    primaries: SearchProvider[],
  ): void => {
    options.signal?.throwIfAborted();
    settled.forEach((result, index) => {
      if (result.status === 'rejected') {
        const error = result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
        failures.push(classifyEngineError(primaries[index], error));
        return;
      }
      for (const outcome of result.value) {
        allResults.push(...outcome.results);
        if (outcome.status === 'failed' && outcome.error) {
          failures.push(classifyEngineError(outcome.engine, outcome.error));
        }
      }
    });
  };
  const evaluateParallelEvidence = (): SearchEvidenceEvaluation => {
    return evidenceEvaluator.evaluate(allResults);
  };
  const assessParallelEvidence = async (): Promise<void> => {
    parallelEvaluation = evaluateParallelEvidence();
    if (semanticRoutingEnabled) {
      preparedSemanticResults = await applySemanticProcessing(
        parallelEvaluation.results,
        query,
        options.signal,
      );
      parallelGate = evidenceEvaluator.assess(preparedSemanticResults);
      return;
    }
    parallelGate = parallelEvaluation.qualityGate;
  };

  // Batch 1: Free engines
  logger.info({ engines: phase1Engines }, 'Phase 1: free engines (batch)');
  
  for (let i = 0; i < phase1Engines.length; i += BATCH_SIZE) {
    const batch = phase1Engines.slice(i, i + BATCH_SIZE);
    freePhaseAttempted = true;
    const batchResults = await Promise.allSettled(
      batch.map(engine => searchProviderChain(engine, count))
    );

    collectProviderChainOutcomes(batchResults, batch);

    // Result count is necessary but not sufficient: only stop if the current
    // display basket also has enough relevant, reliable, independent evidence.
    if (allResults.length >= count * 1.5) {
      await assessParallelEvidence();
      if (parallelGate?.sufficient) {
        stoppedEarly =
          i + BATCH_SIZE < phase1Engines.length
          || paidToSearch.length > 0;
        logger.info(
          { count: allResults.length, qualityGate: parallelGate, stoppedEarly },
          stoppedEarly
            ? 'Parallel quality gate satisfied; skipping remaining work'
            : 'Parallel quality gate satisfied at the end of selected work',
        );
        break;
      }
    }
  }

  // Always assess the completed free phase. Otherwise a basket with enough raw
  // rows to meet `count` but too few to reach the batching threshold could
  // silently skip an explicitly requested optional provider.
  if (!parallelEvaluation) {
    await assessParallelEvidence();
  }
  if (
    !stoppedEarly
    && allResults.length >= count
    && parallelGate?.sufficient
    && paidToSearch.length > 0
  ) {
    stoppedEarly = true;
  }

  logger.info({ count: allResults.length }, 'Phase 1 results');

  // ── Step 4: Fallback to paid engines if not enough ───────────────────
  const qualityGateFailed = !parallelGate?.sufficient;
  if (allResults.length < count || qualityGateFailed) {
    if (paidToSearch.length > 0) {
      optionalPhaseAttempted = true;
      const remaining = qualityGateFailed
        ? count
        : Math.max(count - allResults.length, 1);
      logger.info({ engines: paidToSearch, remaining }, 'Phase 2: paid engines');

      const phase2Results = await Promise.allSettled(
        paidToSearch.map(engine => searchProviderChain(engine, remaining))
      );

      collectProviderChainOutcomes(phase2Results, paidToSearch);
      await assessParallelEvidence();

      logger.info({ got: allResults.length }, 'Phase 2 results');
    } else {
      logger.info('Phase 2: no paid engines available');
    }
  }

  const semanticResults = semanticRoutingEnabled
    ? preparedSemanticResults ?? []
    : parallelEvaluation?.results ?? [];
  const { formatted } = await finalizeSearchResults(
    semanticResults,
    query,
    options.enrich, options.enrichMax, options.enrichMinConfidence,
    options.signal,
  );

  const response: SearchResponse = {
    query,
    engines: userEngines,
    results: formatted.results,
    meta: {
      ...formatted.meta,
      execution: {
        mode: 'parallel',
        engine_calls: searchedEngines.length,
        searched_engines: [...searchedEngines],
        phases_completed: [
          ...(freePhaseAttempted ? ['free'] : []),
          ...(optionalPhaseAttempted ? ['optional'] : []),
        ],
        early_stop: stoppedEarly,
        stop_reason: stoppedEarly
          ? 'quality_gate_satisfied'
          : 'phases_exhausted',
        quality_gate_stage: semanticRoutingEnabled
          ? 'post_semantic'
          : 'pre_semantic',
        ...(parallelGate ? { quality_gate: parallelGate } : {}),
      },
    },
    security_note: formatted.security_note,
    detected_language: detectedLang,
    ...(config.outputStyle !== 'compact' ? {
      rate_limits: rateLimiter.getAllRateLimits(searchedEngines),
    } : {}),
    ...(failures.length > 0
      ? { partialFailures: failures as EngineError[] }
      : {}),
  };

  // ── Step 8: Async cache write (from ddgs) ───────────────────────────
  // Don't block the response - write cache in background
  setImmediate(() => {
    try {
      cache.set(cacheKey, response);
      logger.info({ total: response.meta.total }, 'Search complete');
    } catch (err) {
      logger.error({ err }, 'Cache write failed');
    }
  });

  return response;
}

/**
 * Apply optional semantic dedup/rerank without formatting or enrichment so
 * routing can assess the exact transformed display basket.
 */
async function applySemanticProcessing(
  scored: ScoredResult[],
  query: string,
  signal?: AbortSignal,
): Promise<ScoredResult[]> {
  signal?.throwIfAborted();
  if (isSemanticRoutingEnabled()) {
    try {
      if (config.semanticDedup) {
        const dedupResult = await semanticDedup(scored, config.dedupThreshold, config.dedupModel);
        scored = dedupResult.results;
        logger.info({ removed: dedupResult.removedCount, kept: scored.length }, 'Semantic dedup applied');
      }
      if (config.semanticRerank) {
        scored = await semanticRerank(query, scored, config.rerankTopK, config.rerankModel);
        logger.info({ topK: config.rerankTopK, total: scored.length }, 'Semantic rerank applied');
      }
    } catch (err) {
      signal?.throwIfAborted();
      logger.warn({ err: String(err).slice(0, 120) }, 'Semantic processing failed, continuing with raw results');
    }
  }
  signal?.throwIfAborted();
  return scored;
}

/**
 * Enrich and format a normalized, optionally semantic-processed basket.
 */
async function finalizeSearchResults(
  scored: ScoredResult[],
  query: string,
  enrich: boolean | undefined,
  enrichMax: number | undefined,
  enrichMinConfidence: number | undefined,
  signal?: AbortSignal,
): Promise<{ scored: ScoredResult[]; formatted: ReturnType<typeof formatResults> }> {
  signal?.throwIfAborted();
  // Content enrichment (optional)
  if (enrich) {
    const enriched = await enrichResults(scored, {
      maxEnrich: enrichMax,
      minConfidence: enrichMinConfidence,
      signal,
    });
    scored = enriched.results;
    if (enriched.enriched > 0) {
      logger.info({ enriched: enriched.enriched, failures: enriched.failures }, "Content enrichment done");
    }
  }
  signal?.throwIfAborted();

  // Format output
  const fmtOptions: FormatOptions = {
    style: config.outputStyle,
    snippetMax: config.snippetLength,
    maxFullResults: config.maxFullResults,
    minConfidence: config.minConfidence,
    minSourceCount: config.minSourceCount,
    query,
    evidenceBudgetChars: config.evidenceBudgetChars,
  };
  const formatted = formatResults(scored, fmtOptions);

  return { scored, formatted };
}

const WATERFALL_PHASES = {
  phase1a: ["duckduckgo", "sogou"],
  phase1b: ["bing", "baidu"],
  phase1c: ["wikipedia", "startpage", "yandex", "mojeek"],
  phase2: ["brave", "tavily", "exa", "youcom"],
} as const;

function selectWaterfallPhase(
  phase: readonly string[],
  requestedEngines: Set<SearchProvider> | undefined,
): SearchProvider[] {
  const engines = phase as readonly SearchProvider[];
  return requestedEngines === undefined
    ? [...engines]
    : engines.filter(engine => requestedEngines.has(engine));
}

async function executeWaterfallSearch(options: SearchWithFallbackOptions, depth: number = 0): Promise<SearchResponse> {
  const semanticRoutingEnabled = isSemanticRoutingEnabled();
  // Guard against infinite recursion from query expansion
  if (depth > 2) {
    logger.warn({ query: options.query, depth }, 'Waterfall recursion depth exceeded, returning empty');
    return {
      query: options.query,
      engines: [],
      results: [],
      meta: { total: 0, high_confidence: 0, engines: [] },
      security_note: getSecurityNote(),
    } as SearchResponse;
  }

  const {
    query,
    count = 10,
    language,
    includeDomains,
    excludeDomains,
    minConfidence = 0,
    minSourceCount = 1,
    waterfallMinResults = 3,
    waterfallMinConfidence = 0.6,
  } = options;
  const effectiveThresholds = getEffectiveResultThresholds(
    minConfidence,
    minSourceCount,
  );

  const detectedLang = (!language || language === 'auto') ? detectLanguage(query) : language;
  logger.info({ query, detectedLang, explicitLang: language }, 'Language detection (waterfall)');

  const cacheKey = makeSearchCacheKey(options);
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query, count, engines: options.engines }, 'Waterfall cache hit');
    return { ...(cached as SearchResponse), cache_hit: true };
  }

  const allResults: SearchResult[] = [];
  const allFailures: EngineError[] = depth === 0
    ? getMissingCredentialFailures(options.engines)
    : [];
  const searchedEngines: string[] = [];
  const phasesCompleted: string[] = [];
  const requestedEngines = options.engines === undefined
    ? undefined
    : new Set(options.engines);
  const requestedProviderFamilyCount = requestedEngines === undefined
    ? 2
    : new Set([...requestedEngines].map(getProviderFamily)).size;
  const requiredProviderFamilies = Math.min(
    2,
    Math.max(requestedProviderFamilyCount, 1),
  );
  const paidAvailable = selectWaterfallPhase(
    WATERFALL_PHASES.phase2,
    requestedEngines,
  ).filter(hasApiKey);
  const expansionPlan = (() => {
    if (options.expandQueries === false) {
      return { alternatives: [] as string[], source: 'disabled' as const };
    }
    if (hasChinese(query)) {
      const alternatives = generateChineseVariants(query);
      if (alternatives.length > 0) {
        return { alternatives, source: 'chinese-optimizer' as const };
      }
    }
    return {
      alternatives: expandQuery(query),
      source: 'generic' as const,
    };
  })();
  const freePhases = [
    {
      label: '1a',
      engines: selectWaterfallPhase(WATERFALL_PHASES.phase1a, requestedEngines),
    },
    {
      label: '1b',
      engines: selectWaterfallPhase(WATERFALL_PHASES.phase1b, requestedEngines),
    },
    {
      label: '1c',
      engines: selectWaterfallPhase(WATERFALL_PHASES.phase1c, requestedEngines),
    },
  ];

  let lastBasket: ConfidenceBasketResult | undefined;
  let stoppedEarly = false;
  let preparedSemanticResults: ScoredResult[] | undefined;

  const evidenceEvaluator = createSearchEvidenceEvaluator({
    query,
    engineWeights: ENGINE_WEIGHTS,
    minConfidence: effectiveThresholds.minConfidence,
    minSourceCount: effectiveThresholds.minSourceCount,
    includeDomains,
    excludeDomains,
    qualityGate: {
      minResults: waterfallMinResults,
      minAvgConfidence: waterfallMinConfidence,
      minProviderFamilies: requiredProviderFamilies,
      topK: 5,
    },
  });
  const evaluateCurrentEvidence = (): SearchEvidenceEvaluation => (
    evidenceEvaluator.evaluate(allResults)
  );

  async function searchBatch(engines: SearchProvider[], phaseLabel: string): Promise<boolean> {
    phasesCompleted.push(phaseLabel);
    const batchSize = calculateAdaptiveConcurrency(engines, count);

    for (let i = 0; i < engines.length; i += batchSize) {
      const batch = engines.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (engine) => {
          searchedEngines.push(engine);
          return searchEngine(engine, query, count, 2, options.signal);
        })
      );

      collectEngineOutcomes(batchResults, batch, allResults, allFailures, options.signal);
    }

    const evaluation = evaluateCurrentEvidence();
    if (semanticRoutingEnabled) {
      preparedSemanticResults = await applySemanticProcessing(
        evaluation.results,
        query,
        options.signal,
      );
      lastBasket = evidenceEvaluator.assess(preparedSemanticResults);
    } else {
      lastBasket = evaluation.qualityGate;
    }

    logger.info(
      { phase: phaseLabel, total: allResults.length, basket: lastBasket },
      "Waterfall phase complete",
    );
    return lastBasket.sufficient;
  }

  let basketFull = false;
  for (let phaseIndex = 0; phaseIndex < freePhases.length; phaseIndex++) {
    const phase = freePhases[phaseIndex];
    if (phase.engines.length === 0) continue;
    basketFull = await searchBatch(phase.engines, phase.label);
    if (basketFull) {
      stoppedEarly =
        freePhases.slice(phaseIndex + 1).some(candidate => candidate.engines.length > 0)
        || paidAvailable.length > 0
        || expansionPlan.alternatives.length > 0;
      logger.info(
        { phase: phase.label, stoppedEarly },
        stoppedEarly
          ? 'Waterfall basket satisfied; skipping remaining work'
          : 'Waterfall basket satisfied at the end of selected work',
      );
      break;
    }
  }

  if (!basketFull) {
    if (paidAvailable.length > 0) {
      logger.info({ engines: paidAvailable }, "Waterfall Phase 2: paid engines");
      basketFull = await searchBatch(paidAvailable, '2');
      if (basketFull) {
        stoppedEarly = expansionPlan.alternatives.length > 0;
      }
    } else {
      logger.info("Phase 2: no paid engines available");
    }
  }

  // ── Phase 3: Query Expansion (if confidence still low) ──────────
  let expansionRan = false;
  if (!basketFull && options.expandQueries !== false) {
    const { alternatives, source } = expansionPlan;
    if (alternatives.length > 0) {
      expansionRan = true;
      phasesCompleted.push('3');
      logger.info({ alternatives, source }, "Phase 3: query expansion");
      for (const altQuery of alternatives) {
        options.signal?.throwIfAborted();
        const altSearch = await executeWaterfallSearch({
          ...options,
          query: altQuery,
          waterfall: true,
          enrich: false,
          expandQueries: false,
        }, depth + 1);
        const altExecution = altSearch.meta.execution;
        if (altExecution) {
          searchedEngines.push(...altExecution.searched_engines);
        }
        if (altSearch.results && altSearch.results.length > 0) {
          for (const r of altSearch.results) {
            allResults.push({
              title: r.title,
              url: r.url,
              snippet: r.snippet || '',
              source: "expanded",
              // Preserve provenance per result. The response-level engine list
              // can contain providers that never returned this URL.
              engines: r.sources || [],
            });
          }
        }
      }
    }
  }

  // Query expansion may add evidence after the last routing check, so evaluate
  // once more before producing the response.
  const finalEvaluation = evaluateCurrentEvidence();
  const finalScored = semanticRoutingEnabled
    && preparedSemanticResults
    && !expansionRan
    ? preparedSemanticResults
    : await applySemanticProcessing(
      finalEvaluation.results,
      query,
      options.signal,
    );
  lastBasket = semanticRoutingEnabled
    ? evidenceEvaluator.assess(finalScored)
    : finalEvaluation.qualityGate;
  const { formatted } = await finalizeSearchResults(
    finalScored,
    query,
    options.enrich, options.enrichMax, options.enrichMinConfidence,
    options.signal,
  );

  const response = {
    query,
    engines: searchedEngines,
    ...formatted,
    meta: {
      ...formatted.meta,
      execution: {
        mode: 'waterfall',
        engine_calls: searchedEngines.length,
        searched_engines: [...searchedEngines],
        phases_completed: phasesCompleted,
        early_stop: stoppedEarly,
        stop_reason: stoppedEarly
          ? 'quality_gate_satisfied'
          : 'phases_exhausted',
        quality_gate_stage: semanticRoutingEnabled
          ? 'post_semantic'
          : 'pre_semantic',
        ...(lastBasket ? { quality_gate: lastBasket } : {}),
      },
    },
    detected_language: detectedLang,
    ...(config.outputStyle !== 'compact' ? { rate_limits: rateLimiter.getAllRateLimits(searchedEngines) } : {}),
    ...(allFailures.length > 0 ? { partialFailures: allFailures } : {}),
  } as SearchResponse;

  setImmediate(() => {
    try {
      cache.set(cacheKey, response);
    } catch (err) {
      logger.error({ err }, "Cache write failed");
    }
  });

  return response;
}

// ─── Tool registration ──────────────────────────────────────────────────

// Export the health tracker instance so index.ts can use the same singleton
export { cache, healthTracker, serverMetrics, enginePolicy };

export function setupFreeSearchTool(server: McpServer): void {
  server.registerTool(
    'free_search',
    {
      description:
        'Search the web with an explicit adapter set and bounded fallback.\n\n' +
        'Best for: Quick fact-finding, general search, when date/domain filters are not needed.\n' +
        'Not recommended for: Filtered or verified-only results — use free_search_advanced. ' +
        'For full page content — use free_extract.\n\n' +
        'Twelve adapters are selectable; the default request uses DuckDuckGo + Sogou only. ' +
        'Adapters that share one upstream family are tried sequentially on failure and never double-count as corroboration. ' +
        'Explicitly requested optional API adapters run only when credentials are present and the free basket is short or below the quality gate.\n' +
        'Results are deduplicated and include separate confidence, relevance, and source-count signals.\n\n' +
        '@readOnly true @idempotent true — makes outbound HTTP requests to configured search engines. ' +
        'Injection detection and SSRF protection active.',
      inputSchema: {
        query: z.string().min(1, 'Search query must not be empty')
          .describe('Search query string. Use natural language (e.g., "latest AI news 2026"). For Chinese coverage, include Sogou or Baidu in engines.'),
        limit: z.number().int().min(1).max(50).default(10).describe('Number of results to return (1-50). Default 10. Higher values increase token usage.'),
        engines: z.array(z.enum(['duckduckgo', 'sogou', 'bing', 'baidu', 'wikipedia', 'startpage', 'yandex', 'mojeek', 'brave', 'tavily', 'exa', 'youcom']))
          .min(1)
          .default(['duckduckgo', 'sogou'])
          .describe('Search engines to use (default: duckduckgo + sogou). Free engines work without API keys. ' +
            'Optional API engines require their corresponding environment-variable credentials. ' +
            'For Chinese results, include sogou or baidu.'),
      },
      outputSchema: searchOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, limit = 10, engines: userEngines }, extra) => {
      const start = Date.now();
      try {
        const results = await searchWithFallback({
          query,
          count: limit,
          engines: userEngines,
          signal: extra?.signal,
        });
        serverMetrics.recordRequest(Date.now() - start);
        return createSearchToolResult(results);
      } catch (error) {
        if (extra?.signal.aborted) throw error;
        serverMetrics.recordRequest(Date.now() - start);
        logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Search tool execution failed');
        return {
          content: [
            {
              type: 'text',
              text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
