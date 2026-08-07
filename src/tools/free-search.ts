import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  classifyEngineError,
  EngineAdapterError,
  isEngineAdapterError,
} from '../engines/engine-error.js';
import {
  ENGINE_WEIGHTS,
  WATERFALL_PHASES,
  hasEngineCredential,
  optionalEngineCredentialEnvironment,
  freeEngines,
  paidEngines,
} from '../engines/provider-catalog.js';
import {
  resolveSearchRequestContext,
  type SearchRequestContext,
} from '../engines/search-request-context.js';
import { getSecurityNote } from '../infrastructure/security.js';
import {
  getDefaultSearchRuntime,
  type SearchRuntime,
} from '../infrastructure/search-runtime.js';
import {
  SEARCH_PROVIDERS,
  type EngineError,
  type SearchProvider,
  type SearchResult,
} from '../types.js';
import {
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
import {
  logger,
  abortableDelay,
  SearchRequestBudget,
  createSearchCacheKey,
  isCacheableSearchResponse,
  createSearchProviderPlan,
  type SearchRequestBudgetSnapshot,
} from '../infrastructure/index.js';

const FREE_ENGINES: readonly SearchProvider[] = freeEngines;
const PAID_ENGINES: readonly SearchProvider[] = paidEngines;

function isSemanticRoutingEnabled(runtime: SearchRuntime): boolean {
  return runtime.config.semanticDedup || runtime.config.semanticRerank;
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
  runtime: SearchRuntime,
  engine: SearchProvider,
  query: string,
  limit: number,
  requestContext: SearchRequestContext,
  maxRetries: number = 2,
  signal?: AbortSignal,
  budget?: SearchRequestBudget,
  callerSignal?: AbortSignal,
): Promise<EngineOutcome> {
  signal?.throwIfAborted();
  if (
    runtime.config.searchProviderMode === 'free_only'
    && PAID_ENGINES.includes(engine)
  ) {
    return {
      engine,
      status: 'failed',
      results: [],
      error: new EngineAdapterError(
        'permission_denied',
        `${engine} is disabled by SEARCH_PROVIDER_MODE=free_only`,
        {
          retryable: false,
          suggestion: 'Choose a zero-key engine or change SEARCH_PROVIDER_MODE',
        },
      ),
    };
  }
  // Skip engines blocked by policy
  if (!runtime.enginePolicy.isAllowed(engine)) {
    logger.info({ engine }, 'Engine blocked by policy');
    return {
      engine,
      status: 'failed',
      results: [],
      error: new EngineAdapterError(
        'permission_denied',
        `${engine} is blocked by the configured engine policy`,
        {
          retryable: false,
          suggestion: 'Choose an allowed engine or update the engine policy',
        },
      ),
    };
  }

  // Acquire one logical provider attempt, including any internal retries.
  const admission = runtime.healthTracker.acquireAttempt(engine);
  if (!admission.acquired) {
    const retryAt = admission.retryAt === null
      ? 'after provider recovery'
      : new Date(admission.retryAt).toISOString();
    logger.warn(
      { engine, failureType: admission.failureType, retryAt: admission.retryAt },
      'Skipping unavailable provider',
    );
    return {
      engine,
      status: 'failed',
      results: [],
      error: new EngineAdapterError(
        admission.failureType,
        `${engine} is cooling down until ${retryAt}`,
        {
          retryable: true,
          suggestion: 'Use another provider or retry after the cooldown expires',
        },
      ),
    };
  }

  const { lease } = admission;
  try {
    // Rate limit before making the request
    await runtime.rateLimiter.waitForSlot(engine, signal);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (budget && !budget.claimEngineCall()) {
        return { engine, status: 'skipped', results: [] };
      }
      const startTime = Date.now();
      try {
        const engineOptions = {
          signal,
          throwOnError: true,
          requestContext,
        };
        const results = await runtime.searchProvider(engine, query, limit, engineOptions);
        signal?.throwIfAborted();
        const latency = Date.now() - startTime;
        lease.finish({ status: 'success', latency });
        logger.info({ engine, latency, count: results.length, attempt }, 'Search completed');
        return { engine, status: 'success', results };
      } catch (err) {
        callerSignal?.throwIfAborted();
        if (budget?.isBudgetAbort()) {
          return { engine, status: 'skipped', results: [] };
        }
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
        if (
          isEngineAdapterError(lastError)
          && lastError.cooldownMs
          && lastError.failureType !== 'budget_exhausted'
        ) {
          lease.finish({
            status: 'suspended',
            cooldownMs: lastError.cooldownMs,
            failureType: lastError.failureType,
          });
        } else {
          lease.finish({
            status: 'failure',
            failureType: isEngineAdapterError(lastError)
              && lastError.failureType !== 'budget_exhausted'
              ? lastError.failureType
              : 'unknown',
          });
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
  } finally {
    lease.finish({ status: 'released' });
  }
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

function hasApiKey(engine: SearchProvider): boolean {
  return hasEngineCredential(engine);
}

function normalizePaidEngineOrder(order: readonly string[]): SearchProvider[] {
  const paid = new Set(PAID_ENGINES);
  return [...new Set(order)]
    .filter((engine): engine is SearchProvider => paid.has(engine as SearchProvider));
}

function getDefaultProviderPlan(runtime: SearchRuntime, waterfall: boolean) {
  return createSearchProviderPlan({
    mode: runtime.config.searchProviderMode,
    freeStages: waterfall
      ? [
        WATERFALL_PHASES.phase1a,
        WATERFALL_PHASES.phase1b,
        WATERFALL_PHASES.phase1c,
      ]
      : [['duckduckgo', 'sogou']],
    paidEngines: normalizePaidEngineOrder(runtime.config.paidEngineOrder),
    hasCredential: hasApiKey,
  });
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

interface ResolvedSearchWithFallbackOptions extends SearchWithFallbackOptions {
  requestContext: SearchRequestContext;
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
      scheduled_adapters?: number;
      adapter_attempts?: number;
      http_requests?: number | null;
      searched_engines: string[];
      phases_completed: string[];
      early_stop: boolean;
      stop_reason:
        | 'quality_gate_satisfied'
        | 'phases_exhausted'
        | 'budget_exhausted';
      budget?: SearchRequestBudgetSnapshot;
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
const pendingRequestsByRuntime = new WeakMap<
  SearchRuntime,
  Map<string, Promise<SearchResponse>>
>();

function getPendingRequests(runtime: SearchRuntime): Map<string, Promise<SearchResponse>> {
  const existing = pendingRequestsByRuntime.get(runtime);
  if (existing) return existing;
  const pending = new Map<string, Promise<SearchResponse>>();
  pendingRequestsByRuntime.set(runtime, pending);
  return pending;
}

/**
 * Generate cache key for request collapsing.
 */
function makeCollapseKey(options: ResolvedSearchWithFallbackOptions): string {
  const {
    query, count = 10, engines = [], minConfidence = 0, minSourceCount = 1,
    requestContext, includeDomains = [], excludeDomains = [], waterfall = false,
    waterfallMinResults = 3, waterfallMinConfidence = 0.6,
    enrich = false, enrichMax, enrichMinConfidence, expandQueries = true,
  } = options;
  return JSON.stringify({
    query,
    count,
    engines: [...engines].sort(),
    minConfidence,
    minSourceCount,
    language: requestContext.language,
    region: requestContext.region,
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

function makeSearchCacheKey(
  runtime: SearchRuntime,
  options: ResolvedSearchWithFallbackOptions,
): string {
  const { config } = runtime;
  const count = options.count ?? 10;
  const engines = options.engines
    ?? getDefaultProviderPlan(runtime, options.waterfall === true)
      .flatMap(stage => stage.engines);
  return createSearchCacheKey({
    request: {
      query: options.query,
      count,
      engines: [...engines].sort(),
      language: options.requestContext.language,
      region: options.requestContext.region,
      include_domains: [...(options.includeDomains ?? [])].sort(),
      exclude_domains: [...(options.excludeDomains ?? [])].sort(),
      min_confidence: options.minConfidence ?? 0,
      min_source_count: options.minSourceCount ?? 1,
    },
    strategy: {
      mode: options.waterfall ? 'waterfall' : 'parallel',
      waterfall_min_results: options.waterfallMinResults ?? 3,
      waterfall_min_confidence: options.waterfallMinConfidence ?? 0.6,
      expand_queries: options.expandQueries !== false,
      enrich: options.enrich === true,
      enrich_max: options.enrichMax ?? null,
      enrich_min_confidence: options.enrichMinConfidence ?? null,
      semantic_dedup: config.semanticDedup,
      dedup_threshold: config.dedupThreshold,
      dedup_model: config.dedupModel,
      semantic_rerank: config.semanticRerank,
      rerank_top_k: config.rerankTopK,
      rerank_model: config.rerankModel,
    },
    output: {
      style: config.outputStyle,
      snippet_length: config.snippetLength,
      max_full_results: config.maxFullResults,
      evidence_budget_chars: config.evidenceBudgetChars,
      min_confidence: config.minConfidence,
      min_source_count: config.minSourceCount,
    },
    provider_policy: {
      allowed_engines: normalizePolicyList(config.ALLOWED_ENGINES),
      denied_engines: normalizePolicyList(config.DENIED_ENGINES),
    },
    freshness: {
      ttl_ms: config.searchCacheTtlMs,
    },
  });
}

function cloneCachedSearchResponse(cached: SearchResponse): SearchResponse {
  const stable = { ...cached };
  delete stable.rate_limits;
  return {
    ...stable,
    meta: {
      ...cached.meta,
      ...(cached.meta.execution
        ? { execution: { ...cached.meta.execution } }
        : {}),
    },
    ...(cached.partialFailures
      ? { partialFailures: [...cached.partialFailures] }
      : {}),
    cache_hit: true,
  };
}

function normalizePolicyList(value: string | string[]): string[] {
  const entries = Array.isArray(value) ? value : value.split(',');
  return entries.map(entry => entry.trim()).filter(Boolean).sort();
}

function collectEngineOutcomes(
  settled: PromiseSettledResult<EngineOutcome>[],
  engines: SearchProvider[],
  allResults: SearchResult[],
  failures: EngineError[],
  signal?: AbortSignal,
  budget?: SearchRequestBudget,
): void {
  signal?.throwIfAborted();
  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      failures.push(classifyEngineError(engines[index], error));
      return;
    }
    allResults.push(...(budget
      ? budget.admitResults(result.value.results)
      : result.value.results));
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
export async function searchWithFallback(
  options: SearchWithFallbackOptions,
  runtime: SearchRuntime = getDefaultSearchRuntime(),
): Promise<SearchResponse> {
  options.signal?.throwIfAborted();
  const requestedCount = options.count ?? 10;
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) {
    throw new RangeError('count must be an integer between 1 and 50');
  }
  const resolvedOptions: ResolvedSearchWithFallbackOptions = {
    ...options,
    requestContext: resolveSearchRequestContext(options.query, options.language),
  };
  if (options.signal) {
    return executeSearch(resolvedOptions, runtime);
  }
  const collapseKey = makeCollapseKey(resolvedOptions);
  const pendingRequests = getPendingRequests(runtime);
  
  // Check if same request is already in-flight
  const pending = pendingRequests.get(collapseKey);
  if (pending) {
    logger.info({ query: options.query }, 'Request collapsing: reusing pending request');
    return pending;
  }
  
  // Start new request and track it
  const searchPromise = executeSearch(resolvedOptions, runtime);
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
async function executeSearch(
  options: ResolvedSearchWithFallbackOptions,
  runtime: SearchRuntime,
): Promise<SearchResponse> {
  const { config } = runtime;
  const budget = new SearchRequestBudget({
    engine_calls: config.searchBudgetMaxCalls,
    elapsed_ms: config.searchBudgetMaxElapsedMs,
    result_count: config.searchBudgetMaxResults,
    evidence_chars: config.evidenceBudgetChars,
  }, options.signal);
  try {
    const response = options.waterfall
      ? await executeWaterfallSearch(options, 0, budget, runtime)
      : await executeParallelSearch(options, budget, runtime);
    const evidence = response.meta.evidence_budget;
    budget.observeEvidence(evidence?.used ?? 0);
    const snapshot = budget.snapshot();
    if (response.meta.execution) {
      response.meta.execution.budget = snapshot;
      response.meta.execution.adapter_attempts = snapshot.observed.engine_calls;
      response.meta.execution.http_requests ??= null;
      if (snapshot.exhausted_reasons.some(reason => reason !== 'evidence_chars')) {
        response.meta.execution.stop_reason = 'budget_exhausted';
        response.meta.execution.early_stop = true;
        response.partialFailures = [
          ...(response.partialFailures ?? []),
          {
            engine: 'request_budget',
            type: 'budget_exhausted',
            message: `Search request budget exhausted: ${snapshot.exhausted_reasons.join(', ')}`,
            suggestion: 'Narrow the query or raise the configured request budget',
          },
        ];
      }
    }
    return response;
  } finally {
    budget.dispose();
  }
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
function calculateAdaptiveConcurrency(
  runtime: SearchRuntime,
  engines: SearchProvider[],
  count: number,
): number {
  const unhealthyCount = engines.filter(
    e => !runtime.healthTracker.isHealthy(e),
  ).length;
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
  runtime: SearchRuntime,
  requestedMinConfidence: number,
  requestedMinSourceCount: number,
): { minConfidence: number; minSourceCount: number } {
  const { config } = runtime;
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

async function executeParallelSearch(
  options: ResolvedSearchWithFallbackOptions,
  budget: SearchRequestBudget,
  runtime: SearchRuntime,
): Promise<SearchResponse> {
  const { cache, config, rateLimiter } = runtime;
  const semanticRoutingEnabled = isSemanticRoutingEnabled(runtime);
  const {
    query,
    count = 10,
    engines: explicitEngines,
    minConfidence = 0,
    minSourceCount = 1,
    requestContext,
    includeDomains,
    excludeDomains,
  } = options;
  const defaultPlan = getDefaultProviderPlan(runtime, false);
  const userEngines = explicitEngines
    ?? defaultPlan.flatMap(stage => stage.engines);
  const effectiveThresholds = getEffectiveResultThresholds(
    runtime,
    minConfidence,
    minSourceCount,
  );

  logger.info({
    query,
    requestContext,
    explicitLang: options.language,
  }, 'Search request context resolved');

  // Check cache first
  const cacheKey = makeSearchCacheKey(runtime, options);
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query, count, engines: userEngines }, 'Cache hit');
    return cloneCachedSearchResponse(cached as SearchResponse);
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
  const paidFirst = explicitEngines === undefined
    && config.searchProviderMode === 'paid_first'
    && optionalProviderChains.length > 0;
  const phase1ProviderChains = paidFirst
    ? optionalProviderChains
    : freeProviderChains;
  const phase2ProviderChains = paidFirst
    ? freeProviderChains
    : optionalProviderChains;
  const phase1Engines = phase1ProviderChains.map(chain => chain[0]);
  const phase2Engines = phase2ProviderChains.map(chain => chain[0]);
  const phase1Kind = paidFirst ? 'optional' : 'free';
  const phase2Kind = paidFirst ? 'free' : 'optional';
  const providerChainByPrimary = new Map(
    [...freeProviderChains, ...optionalProviderChains]
      .map(chain => [chain[0], chain] as const),
  );

  // ── Step 3: Batch concurrency + early exit (from ddgs) ──────────────
  const BATCH_SIZE = calculateAdaptiveConcurrency(runtime, phase1Engines, count);
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
      if (!budget.canContinue()) break;
      const outcome = await searchEngine(
        runtime,
        engine,
        query,
        limit,
        requestContext,
        2,
        budget.signal,
        budget,
        options.signal,
      );
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
        allResults.push(...budget.admitResults(outcome.results));
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
        runtime,
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
  logger.info(
    { engines: phase1Engines, kind: phase1Kind },
    'Parallel primary phase',
  );
  
  for (let i = 0; i < phase1Engines.length; i += BATCH_SIZE) {
    if (!budget.canContinue()) break;
    const batch = phase1Engines.slice(i, i + BATCH_SIZE);
    if (phase1Kind === 'free') freePhaseAttempted = true;
    else optionalPhaseAttempted = true;
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
          || phase2Engines.length > 0;
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
    && phase2Engines.length > 0
  ) {
    stoppedEarly = true;
  }

  logger.info({ count: allResults.length }, 'Phase 1 results');

  // ── Step 4: Fallback to paid engines if not enough ───────────────────
  const qualityGateFailed = !parallelGate?.sufficient;
  if (budget.canContinue() && (allResults.length < count || qualityGateFailed)) {
    if (phase2Engines.length > 0) {
      if (phase2Kind === 'free') freePhaseAttempted = true;
      else optionalPhaseAttempted = true;
      const remaining = qualityGateFailed
        ? count
        : Math.max(count - allResults.length, 1);
      logger.info(
        { engines: phase2Engines, kind: phase2Kind, remaining },
        'Parallel fallback phase',
      );

      const phase2Results = await Promise.allSettled(
        phase2Engines.map(engine => searchProviderChain(engine, remaining))
      );

      collectProviderChainOutcomes(phase2Results, phase2Engines);
      await assessParallelEvidence();

      logger.info({ got: allResults.length }, 'Phase 2 results');
    } else {
      logger.info('Parallel fallback phase: no engines available');
    }
  }

  const semanticResults = semanticRoutingEnabled
    ? preparedSemanticResults ?? []
    : parallelEvaluation?.results ?? [];
  const { formatted } = await finalizeSearchResults(
    runtime,
    semanticResults,
    query,
    options.enrich && budget.canContinue(),
    options.enrichMax,
    options.enrichMinConfidence,
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
        scheduled_adapters: new Set([
          ...phase1ProviderChains.flat(),
          ...phase2ProviderChains.flat(),
        ]).size,
        http_requests: null,
        searched_engines: [...searchedEngines],
        phases_completed: [
          ...(phase1Kind === 'free' && freePhaseAttempted ? ['free'] : []),
          ...(phase1Kind === 'optional' && optionalPhaseAttempted ? ['optional'] : []),
          ...(phase2Kind === 'free' && freePhaseAttempted && phase1Kind !== 'free' ? ['free'] : []),
          ...(phase2Kind === 'optional' && optionalPhaseAttempted && phase1Kind !== 'optional' ? ['optional'] : []),
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
    detected_language: requestContext.language,
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
      if (isCacheableSearchResponse(response)) {
        cache.set(cacheKey, response);
      }
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
  runtime: SearchRuntime,
  scored: ScoredResult[],
  query: string,
  signal?: AbortSignal,
): Promise<ScoredResult[]> {
  const { config } = runtime;
  signal?.throwIfAborted();
  if (isSemanticRoutingEnabled(runtime)) {
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
  runtime: SearchRuntime,
  scored: ScoredResult[],
  query: string,
  enrich: boolean | undefined,
  enrichMax: number | undefined,
  enrichMinConfidence: number | undefined,
  signal?: AbortSignal,
): Promise<{ scored: ScoredResult[]; formatted: ReturnType<typeof formatResults> }> {
  const { config } = runtime;
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

function selectWaterfallPhase(
  phase: readonly string[],
  requestedEngines: Set<SearchProvider> | undefined,
): SearchProvider[] {
  const engines = phase as readonly SearchProvider[];
  return requestedEngines === undefined
    ? [...engines]
    : engines.filter(engine => requestedEngines.has(engine));
}

async function executeWaterfallSearch(
  options: ResolvedSearchWithFallbackOptions,
  depth: number = 0,
  budget: SearchRequestBudget,
  runtime: SearchRuntime,
): Promise<SearchResponse> {
  const { cache, config, rateLimiter } = runtime;
  const semanticRoutingEnabled = isSemanticRoutingEnabled(runtime);
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
    requestContext,
    includeDomains,
    excludeDomains,
    minConfidence = 0,
    minSourceCount = 1,
    waterfallMinResults = 3,
    waterfallMinConfidence = 0.6,
  } = options;
  const effectiveThresholds = getEffectiveResultThresholds(
    runtime,
    minConfidence,
    minSourceCount,
  );

  logger.info({
    query,
    requestContext,
    explicitLang: options.language,
  }, 'Search request context resolved (waterfall)');

  const cacheKey = makeSearchCacheKey(runtime, options);
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query, count, engines: options.engines }, 'Waterfall cache hit');
    return cloneCachedSearchResponse(cached as SearchResponse);
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
    normalizePaidEngineOrder(config.paidEngineOrder),
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
  const explicitFreeStages = [
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
  const providerStages = requestedEngines === undefined
    ? (() => {
      let freeStageIndex = 0;
      const freeLabels = ['1a', '1b', '1c'];
      return getDefaultProviderPlan(runtime, true).map(stage => ({
        label: stage.kind === 'optional'
          ? '2'
          : freeLabels[freeStageIndex++],
        engines: stage.engines,
      }));
    })()
    : [
      ...explicitFreeStages,
      { label: '2', engines: paidAvailable },
    ].filter(stage => stage.engines.length > 0);

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
    const batchSize = calculateAdaptiveConcurrency(runtime, engines, count);

    for (let i = 0; i < engines.length; i += batchSize) {
      if (!budget.canContinue()) break;
      const batch = engines.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (engine) => {
          searchedEngines.push(engine);
          return searchEngine(
            runtime,
            engine,
            query,
            count,
            requestContext,
            2,
            budget.signal,
            budget,
            options.signal,
          );
        })
      );

      collectEngineOutcomes(
        batchResults,
        batch,
        allResults,
        allFailures,
        options.signal,
        budget,
      );
    }

    const evaluation = evaluateCurrentEvidence();
    if (semanticRoutingEnabled) {
      preparedSemanticResults = await applySemanticProcessing(
        runtime,
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
  for (let phaseIndex = 0; phaseIndex < providerStages.length; phaseIndex++) {
    const phase = providerStages[phaseIndex];
    if (phase.engines.length === 0) continue;
    if (!budget.canContinue()) break;
    basketFull = await searchBatch(phase.engines, phase.label);
    if (basketFull) {
      stoppedEarly =
        providerStages.slice(phaseIndex + 1)
          .some(candidate => candidate.engines.length > 0)
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

  // ── Phase 3: Query Expansion (if confidence still low) ──────────
  let expansionRan = false;
  if (!basketFull && budget.canContinue() && options.expandQueries !== false) {
    const { alternatives, source } = expansionPlan;
    if (alternatives.length > 0) {
      expansionRan = true;
      phasesCompleted.push('3');
      logger.info({ alternatives, source }, "Phase 3: query expansion");
      for (const altQuery of alternatives) {
        if (!budget.canContinue()) break;
        const altSearch = await executeWaterfallSearch({
          ...options,
          query: altQuery,
          waterfall: true,
          enrich: false,
          expandQueries: false,
        }, depth + 1, budget, runtime);
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
      runtime,
      finalEvaluation.results,
      query,
      options.signal,
    );
  lastBasket = semanticRoutingEnabled
    ? evidenceEvaluator.assess(finalScored)
    : finalEvaluation.qualityGate;
  const { formatted } = await finalizeSearchResults(
    runtime,
    finalScored,
    query,
    options.enrich && budget.canContinue(),
    options.enrichMax,
    options.enrichMinConfidence,
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
        scheduled_adapters: new Set(
          providerStages.flatMap(stage => stage.engines),
        ).size,
        http_requests: null,
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
    detected_language: requestContext.language,
    ...(config.outputStyle !== 'compact' ? { rate_limits: rateLimiter.getAllRateLimits(searchedEngines) } : {}),
    ...(allFailures.length > 0 ? { partialFailures: allFailures } : {}),
  } as SearchResponse;

  setImmediate(() => {
    try {
      if (isCacheableSearchResponse(response)) {
        cache.set(cacheKey, response);
      }
    } catch (err) {
      logger.error({ err }, "Cache write failed");
    }
  });

  return response;
}

// ─── Tool registration ──────────────────────────────────────────────────

export function setupFreeSearchTool(
  server: McpServer,
  runtime: SearchRuntime = getDefaultSearchRuntime(),
): void {
  server.registerTool(
    'free_search',
    {
      description:
        'Search the web with an explicit adapter set and bounded fallback.\n\n' +
        'Best for: Quick fact-finding, general search, when date/domain filters are not needed.\n' +
        'Not recommended for: Filtered or verified-only results — use free_search_advanced. ' +
        'For full page content — use free_extract.\n\n' +
        `${SEARCH_PROVIDERS.length} adapters are selectable; the default request uses DuckDuckGo + Sogou only. ` +
        'Adapters that share one upstream family are tried sequentially on failure and never double-count as corroboration. ' +
        'Explicitly requested optional API adapters run only when credentials are present and the free basket is short or below the quality gate.\n' +
        'Results are deduplicated and include separate confidence, relevance, and source-count signals.\n\n' +
        '@readOnly true @idempotent true — makes outbound HTTP requests to configured search engines. ' +
        'Injection detection and SSRF protection active.',
      inputSchema: {
        query: z.string().min(1, 'Search query must not be empty')
          .describe('Search query string. Use natural language (e.g., "latest AI news 2026"). For Chinese coverage, include Sogou or Baidu in engines.'),
        limit: z.number().int().min(1).max(50).default(10).describe('Number of results to return (1-50). Default 10. Higher values increase token usage.'),
        engines: z.array(z.enum(SEARCH_PROVIDERS))
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
        }, runtime);
        runtime.serverMetrics.recordRequest(Date.now() - start);
        return createSearchToolResult(results);
      } catch (error) {
        if (extra?.signal.aborted) throw error;
        runtime.serverMetrics.recordRequest(Date.now() - start);
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
