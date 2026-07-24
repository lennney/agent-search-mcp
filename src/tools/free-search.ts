import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchDuckDuckGo, isDdgsAvailable } from '../engines/duckduckgo.js';
import { searchSogou } from '../engines/sogou.js';
import { searchBing } from '../engines/bing.js';
import { searchBaidu } from '../engines/baidu.js';
import { BraveProvider } from '../engines/brave.js';
import { TavilyProvider } from '../engines/tavily.js';
import { searchExa } from '../engines/exa.js';
import { getSecurityNote } from '../infrastructure/security.js';
// ── Agent instruction: DO NOT TOUCH ───────────────────────────────────
import type { SearchResult, SearchProvider, EngineError } from '../types.js';
import { dedupByUrl, dedupByTitle, filterLowQuality, scoreAndRank, formatResults, checkConfidenceBasket, enrichResults, expandQuery, hasChinese, generateChineseVariants, detectLanguage, semanticDedup, semanticRerank } from '../aggregation/index.js';
import type { FormatOptions } from '../aggregation/format.js';
import { SearchCache, logger, HealthTracker, RateLimiter, loadConfig, EnginePolicy, ServerMetrics } from '../infrastructure/index.js';

const ALL_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily', 'exa'];
const FREE_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu'];
const PAID_ENGINES: SearchProvider[] = ['brave', 'tavily', 'exa'];

// Engine weights (higher = more trusted)
const ENGINE_WEIGHTS: Record<string, number> = {
  duckduckgo: 0.85,
  sogou: 0.8,
  bing: 0.9,
  baidu: 0.75,
  brave: 0.95,
  tavily: 0.9,
  exa: 0.92,
};

// Infrastructure singletons
const cache = new SearchCache();
const healthTracker = new HealthTracker();
const serverMetrics = new ServerMetrics(cache);
const rateLimiter = new RateLimiter();
const config = loadConfig();
const enginePolicy = new EnginePolicy(config.ALLOWED_ENGINES, config.DENIED_ENGINES);

// ─── Engine provider mapping (from ddgs pattern) ──────────────────────────
// DDG uses Bing as backend, so we track providers to avoid duplicate queries
const PROVIDER_MAP: Record<string, string> = {
  duckduckgo: 'bing',
  sogou: 'sogou',
  bing: 'bing',
  baidu: 'baidu',
  brave: 'brave',
  tavily: 'tavily',
  exa: 'exa',
};

/**
 * Get unique providers from engine list.
 * From ddgs: same provider only searches once.
 */
function getUniqueProviders(engines: SearchProvider[]): SearchProvider[] {
  const seenProviders = new Set<string>();
  const unique: SearchProvider[] = [];
  
  for (const engine of engines) {
    const provider = PROVIDER_MAP[engine] || engine;
    if (!seenProviders.has(provider)) {
      seenProviders.add(provider);
      unique.push(engine);
    }
  }
  
  return unique;
}

/**
 * Search a single engine with health check, rate limiting, and retry logic.
 */
async function searchEngine(
  engine: SearchProvider,
  query: string,
  limit: number,
  maxRetries: number = 2
): Promise<SearchResult[]> {
  // Skip engines blocked by policy
  if (!enginePolicy.isAllowed(engine)) {
    logger.info({ engine }, 'Engine blocked by policy');
    return [];
  }

  // Skip unhealthy providers
  if (!healthTracker.isHealthy(engine)) {
    logger.warn({ engine }, 'Skipping unhealthy provider');
    return [];
  }

  // Rate limit before making the request
  await rateLimiter.waitForSlot(engine);

  // DDG-specific: throw early if ddgs is not available, so Promise.allSettled
  // records it as a rejection → partialFailures gets the correct engine name
  if (engine === 'duckduckgo' && !isDdgsAvailable()) {
    throw new Error('DuckDuckGo unavailable: Python ddgs library not installed. Install with: pip install ddgs');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    try {
      let results: SearchResult[];
      switch (engine) {
        case 'duckduckgo':
          results = await searchDuckDuckGo(query, limit);
          break;
        case 'sogou':
          results = await searchSogou(query, limit);
          break;
        case 'bing':
          results = await searchBing(query, limit);
          break;
        case 'baidu':
          results = await searchBaidu(query, limit);
          break;
        case 'brave':
          results = await new BraveProvider().search(query, limit);
          break;
        case 'tavily':
          results = await new TavilyProvider().search(query, limit);
          break;
        case 'exa':
          results = await searchExa({ query, count: limit, apiKey: process.env.EXA_API_KEY || '' });
          break;
        default:
          return [];
      }
      const latency = Date.now() - startTime;
      healthTracker.recordSuccess(engine, latency);
      logger.info({ engine, latency, count: results.length, attempt }, 'Search completed');
      return results;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const latency = Date.now() - startTime;

      // Check if this is a retryable error (network, timeout, 5xx)
      const isRetryable = isRetryableError(lastError);

      if (attempt < maxRetries && isRetryable) {
        // Exponential backoff: 500ms, 1000ms, 2000ms...
        const delay = Math.min(500 * Math.pow(2, attempt), 5000);
        logger.warn({ engine, attempt, delay, err: lastError.message }, 'Retryable error, retrying...');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable or max retries exceeded
      healthTracker.recordFailure(engine);
      logger.error({ engine, latency, attempt, err: lastError.message }, 'Search failed');
      return [];
    }
  }

  // All retries exhausted
  logger.error({ engine, lastError: lastError?.message }, 'All retries exhausted');
  return [];
}

/**
 * Check if an error is retryable (network, timeout, 5xx).
 */
function isRetryableError(err: Error): boolean {
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
  switch (engine) {
    case 'brave':
      return !!process.env.BRAVE_API_KEY;
    case 'tavily':
      return !!process.env.TAVILY_API_KEY;
    case 'exa':
      return !!process.env.EXA_API_KEY;
    default:
      return true; // free engines always available
  }
}

// ─── Shared options & response types ────────────────────────────────────
export interface SearchWithFallbackOptions {
  query: string;
  count?: number;
  engines?: SearchProvider[];
  minConfidence?: number;
  language?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  waterfall?: boolean;
  waterfallMinResults?: number;
  waterfallMinConfidence?: number;
  enrich?: boolean;
  enrichMax?: number;
  enrichMinConfidence?: number;
}

interface FormattedResult {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
  security?: {
    injection_detected: boolean;
    url_safe: boolean;
    threats: string[];
    warnings: string[];
  };
}

interface SearchResponse {
  query: string;
  engines: SearchProvider[];
  results: FormattedResult[];
  meta: {
    total: number;
    high_confidence: number;
    engines: string[];
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
  const { query, count = 10, engines = [] } = options;
  const sortedEngines = [...engines].sort().join(',');
  return `${query}:${count}:${sortedEngines}`;
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
  
  // Clean up when done
  searchPromise.finally(() => {
    pendingRequests.delete(collapseKey);
  });
  
  return searchPromise;
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

async function executeParallelSearch(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  const {
    query,
    count = 10,
    engines: userEngines = ['duckduckgo', 'sogou'] as SearchProvider[],
    minConfidence = 1,
    language,
    includeDomains,
    excludeDomains,
  } = options;

  const detectedLang = (!language || language === 'auto') ? detectLanguage(query) : language;
  logger.info({ query, detectedLang, explicitLang: language }, 'Language detection');

  // Check cache first
  const cacheKey = cache.makeKey(query, count, userEngines);
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query, count, engines: userEngines }, 'Cache hit');
    return { ...(cached as SearchResponse), cache_hit: true } as SearchResponse;
  }

  logger.info({ query, count, engines: userEngines }, 'Starting search');

  // ── Step 1: Provider dedup (from ddgs) ──────────────────────────────
  // Only search each provider once (e.g., DDG and Bing both use Bing backend)
  const uniqueEngines = getUniqueProviders(userEngines);
  logger.info({ engines: uniqueEngines }, 'After provider dedup');

  // ── Step 2: Determine which engines to search ───────────────────────
  // Phase 1: Free engines
  const freeToSearch = uniqueEngines.filter(e => FREE_ENGINES.includes(e));
  const allFree = FREE_ENGINES.filter(e => !uniqueEngines.includes(e));
  const phase1Engines = [...freeToSearch, ...allFree];

  // ── Step 3: Batch concurrency + early exit (from ddgs) ──────────────
  const BATCH_SIZE = calculateAdaptiveConcurrency(phase1Engines, count);
  const allResults: SearchResult[] = [];
  const failures: EngineError[] = [];
  const searchedEngines: string[] = [];

  // Batch 1: Free engines
  logger.info({ engines: phase1Engines }, 'Phase 1: free engines (batch)');
  
  for (let i = 0; i < phase1Engines.length; i += BATCH_SIZE) {
    const batch = phase1Engines.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (engine) => {
        const results = await searchEngine(engine, query, count);
        searchedEngines.push(engine);
        return { engine, results };
      })
    );

    for (let idx = 0; idx < batchResults.length; idx++) {
      const result = batchResults[idx];
      if (result.status === 'fulfilled') {
        allResults.push(...result.value.results);
      } else {
        failures.push(
            classifyEngineError(batch[idx], result.reason instanceof Error ? result.reason : new Error(result.reason?.message || 'Unknown error'))
          );
      }
    }

    // Early exit: stop if we have enough results
    if (allResults.length >= count * 1.5) {
      logger.info({ count: allResults.length }, 'Early exit: enough results');
      break;
    }
  }

  logger.info({ count: allResults.length }, 'Phase 1 results');

  // ── Step 4: Fallback to paid engines if not enough ───────────────────
  if (allResults.length < count) {
    const paidToSearch = uniqueEngines.filter(
      e => PAID_ENGINES.includes(e) && hasApiKey(e)
    );

    if (paidToSearch.length > 0) {
      const remaining = Math.max(count - allResults.length, 1);
      logger.info({ engines: paidToSearch, remaining }, 'Phase 2: paid engines');

      const phase2Results = await Promise.allSettled(
        paidToSearch.map(async (engine) => {
          const results = await searchEngine(engine, query, remaining);
          searchedEngines.push(engine);
          return { engine, results };
        })
      );

      for (let i = 0; i < phase2Results.length; i++) {
        const result = phase2Results[i];
        if (result.status === 'fulfilled') {
          allResults.push(...result.value.results);
        } else {
failures.push(
            classifyEngineError(paidToSearch[i], result.reason instanceof Error ? result.reason : new Error(result.reason?.message || 'Unknown error'))
          );
        }
      }

      logger.info({ got: allResults.length }, 'Phase 2 results');
    } else {
      logger.info('Phase 2: no paid engines available');
    }
  }

  // ── Step 5: Aggregation layer (fused from ddgs + our patterns) ──────
  
  // 5a. Filter low-quality results (from ddgs)
  const filtered = filterLowQuality(allResults);
  
  // 5b. URL dedup with frequency counting
  const { results: urlDeduped, frequencies } = dedupByUrl(filtered);
  
  // 5c. Title dedup
  const titleDeduped = dedupByTitle(urlDeduped);
  
  // 5d. Score and rank with frequency bonus
  const scored = scoreAndRank(titleDeduped, query, ENGINE_WEIGHTS, frequencies);

  // ── Steps 5e-7: Shared post-processing (semantic + filters + enrich + format)
  const { formatted } = await applyPostProcessing(
    scored, query, minConfidence,
    includeDomains, excludeDomains,
    options.enrich, options.enrichMax, options.enrichMinConfidence,
  );

  const response: SearchResponse = {
    query,
    engines: userEngines,
    results: formatted.results as any,
    meta: formatted.meta,
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
 * Shared post-processing pipeline for both parallel and waterfall search.
 * Handles semantic dedup/rerank, confidence + domain filtering, enrichment,
 * and final formatting. Used by both executeParallelSearch and
 * executeWaterfallSearch to avoid duplication.
 */
async function applyPostProcessing(
  scored: ScoredResult[],
  query: string,
  minConfidence: number,
  includeDomains: string[] | undefined,
  excludeDomains: string[] | undefined,
  enrich: boolean | undefined,
  enrichMax: number | undefined,
  enrichMinConfidence: number | undefined,
): Promise<{ scored: ScoredResult[]; formatted: ReturnType<typeof formatResults> }> {
  // Semantic dedup (optional)
  if (config.semanticDedup || config.semanticRerank) {
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
      logger.warn({ err: String(err).slice(0, 120) }, 'Semantic processing failed, continuing with raw results');
    }
  }

  // Post-search filters
  if (minConfidence > 1) {
    scored = scored.filter(r => r.confidence >= minConfidence);
  }

  if (includeDomains && includeDomains.length > 0) {
    scored = scored.filter(r => {
      try {
        const hostname = new URL(r.url).hostname;
        return includeDomains.some(d => hostname.includes(d) || hostname.endsWith(d));
      } catch {
        return false;
      }
    });
  }

  if (excludeDomains && excludeDomains.length > 0) {
    scored = scored.filter(r => {
      try {
        const hostname = new URL(r.url).hostname;
        return !excludeDomains.some(d => hostname.includes(d) || hostname.endsWith(d));
      } catch {
        return true;
      }
    });
  }

  // Content enrichment (optional)
  if (enrich) {
    const enriched = await enrichResults(scored, {
      maxEnrich: enrichMax,
      minConfidence: enrichMinConfidence,
    });
    scored = enriched.results;
    if (enriched.enriched > 0) {
      logger.info({ enriched: enriched.enriched, failures: enriched.failures }, "Content enrichment done");
    }
  }

  // Format output
  const fmtOptions: FormatOptions = {
    style: config.outputStyle,
    snippetMax: config.snippetLength,
    maxFullResults: config.maxFullResults,
    minConfidence: config.minConfidence,
  };
  const formatted = formatResults(scored, fmtOptions);

  return { scored, formatted };
}

const WATERFALL_PHASES = {
  phase1a: ["duckduckgo", "sogou"],
  phase1b: ["bing", "baidu"],
  phase2: ["brave", "tavily", "exa"],
} as const;

async function executeWaterfallSearch(options: SearchWithFallbackOptions, depth: number = 0): Promise<SearchResponse> {
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
    minConfidence = 1,
    waterfallMinResults = 3,
    waterfallMinConfidence = 0.6,
  } = options;

  const detectedLang = (!language || language === 'auto') ? detectLanguage(query) : language;
  logger.info({ query, detectedLang, explicitLang: language }, 'Language detection (waterfall)');

  const allResults: SearchResult[] = [];
  const allFailures: EngineError[] = [];
  const searchedEngines: string[] = [];

  async function searchBatch(engines: SearchProvider[], phaseLabel: string): Promise<boolean> {
    const batchSize = calculateAdaptiveConcurrency(engines, count);

    for (let i = 0; i < engines.length; i += batchSize) {
      const batch = engines.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (engine) => {
          const results = await searchEngine(engine, query, count);
          searchedEngines.push(engine);
          return { engine, results };
        })
      );

      for (let idx = 0; idx < batchResults.length; idx++) {
        const result = batchResults[idx];
        if (result.status === "fulfilled") {
          allResults.push(...result.value.results);
        } else {
          allFailures.push(
            classifyEngineError(batch[idx], result.reason instanceof Error ? result.reason : new Error(result.reason?.message || 'Unknown error'))
          );
        }
      }
    }

    const filtered = filterLowQuality(allResults);
    const { results: urlDeduped, frequencies } = dedupByUrl(filtered);
    const titleDeduped = dedupByTitle(urlDeduped);
    const scored = scoreAndRank(titleDeduped, query, ENGINE_WEIGHTS, frequencies);

    let basketScored = scored;
    if (includeDomains && includeDomains.length > 0) {
      basketScored = basketScored.filter((r) => {
        try {
          const hostname = new URL(r.url).hostname;
          return includeDomains.some((d) => hostname.includes(d) || hostname.endsWith(d));
        } catch { return false; }
      });
    }
    if (excludeDomains && excludeDomains.length > 0) {
      basketScored = basketScored.filter((r) => {
        try {
          const hostname = new URL(r.url).hostname;
          return !excludeDomains.some((d) => hostname.includes(d) || hostname.endsWith(d));
        } catch { return true; }
      });
    }

    const basket = checkConfidenceBasket(basketScored, {
      minResults: waterfallMinResults,
      minAvgConfidence: waterfallMinConfidence,
      topK: 5,
    });

    logger.info({ phase: phaseLabel, total: allResults.length, basket }, "Waterfall phase complete");
    return basket.sufficient;
  }

  let basketFull = await searchBatch([...WATERFALL_PHASES.phase1a] as SearchProvider[], "1a");
  if (basketFull) {
    logger.info("Phase 1a satisfied — skipping remaining phases");
  }

  if (!basketFull) {
    basketFull = await searchBatch([...WATERFALL_PHASES.phase1b] as SearchProvider[], "1b");
    if (basketFull) {
      logger.info("Phase 1b satisfied — skipping Phase 2");
    }
  }

  if (!basketFull) {
    const paidAvailable = WATERFALL_PHASES.phase2.filter((e) => hasApiKey(e as SearchProvider));
    if (paidAvailable.length > 0) {
      logger.info({ engines: paidAvailable }, "Waterfall Phase 2: paid engines");
      const paidResults = await Promise.allSettled(
        paidAvailable.map(async (engine) => {
          const remaining = Math.max(count - allResults.length, 1);
          const results = await searchEngine(engine as SearchProvider, query, remaining);
          searchedEngines.push(engine);
          return { engine, results };
        })
      );
      for (let i = 0; i < paidResults.length; i++) {
        const result = paidResults[i];
        if (result.status === "fulfilled") {
          allResults.push(...result.value.results);
        } else {
          allFailures.push(
            classifyEngineError(paidAvailable[i], result.reason instanceof Error ? result.reason : new Error(result.reason?.message || 'Unknown error'))
          );
        }
      }
    } else {
      logger.info("Phase 2: no paid engines available");
    }
  }

  // ── Phase 3: Query Expansion (if confidence still low) ──────────
  if (!basketFull) {
    // 3a: Chinese query optimization — try character variants first
    let alternatives: string[] = [];
    if (hasChinese(query)) {
      alternatives = generateChineseVariants(query);
      if (alternatives.length > 0) {
        logger.info({ alternatives, source: 'chinese-optimizer' }, 'Phase 3a: Chinese query variants');
      }
    }
    // 3b: Fall back to generic query expansion for non-Chinese or if Chinese
    //     variants were insufficient (empty or already exhausted)
    if (alternatives.length === 0) {
      alternatives = expandQuery(query);
    }
    if (alternatives.length > 0) {
      logger.info({ alternatives }, "Phase 3: query expansion");
      for (const altQuery of alternatives) {
        const altSearch = await executeWaterfallSearch({
          ...options,
          query: altQuery,
          waterfall: true,
          enrich: false,
        }, depth + 1);
        if (altSearch.results && altSearch.results.length > 0) {
          for (const r of altSearch.results) {
            allResults.push({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              source: "expanded",
              engines: altSearch.meta?.engines || [],
            });
          }
        }
      }
    }
  }

  // Aggregate and output (same logic as executeParallelSearch)
  const filtered = filterLowQuality(allResults);
  const { results: urlDeduped, frequencies } = dedupByUrl(filtered);
  const titleDeduped = dedupByTitle(urlDeduped);
  const scored = scoreAndRank(titleDeduped, query, ENGINE_WEIGHTS, frequencies);

  // ── Steps 5e-7: Shared post-processing (semantic + filters + enrich + format)
  const { formatted } = await applyPostProcessing(
    scored, query, minConfidence,
    includeDomains, excludeDomains,
    options.enrich, options.enrichMax, options.enrichMinConfidence,
  );

  const response = {
    query,
    engines: searchedEngines,
    ...formatted,
    detected_language: detectedLang,
    ...(config.outputStyle !== 'compact' ? { rate_limits: rateLimiter.getAllRateLimits(searchedEngines) } : {}),
    ...(allFailures.length > 0 ? { partialFailures: allFailures } : {}),
  } as SearchResponse;

  setImmediate(() => {
    try {
      cache.set(cache.makeKey(query, count, searchedEngines), response);
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
        'Search the web with multi-engine automatic fallback.\n\n' +
        'Best for: Quick fact-finding, general search, when date/domain filters are not needed.\n' +
        'Not recommended for: Filtered or verified-only results — use free_search_advanced. ' +
        'For full page content — use free_extract.\n\n' +
        'Phase 1: DuckDuckGo + Sogou + Bing + Baidu (free, no key required).\n' +
        'Phase 2: Brave + Tavily + Exa (paid, requires BRAVE_API_KEY / TAVILY_API_KEY / EXA_API_KEY env vars).\n' +
        'Results are deduplicated, scored by confidence (1-3), and include security metadata.\n\n' +
        '@readOnly true @idempotent true — makes outbound HTTP requests to configured search engines. ' +
        'Injection detection and SSRF protection active.',
      inputSchema: {
        query: z.string().min(1, 'Search query must not be empty')
          .describe('Search query string. Use natural language (e.g., "latest AI news 2026"). For Chinese queries, Sogou and Baidu are used automatically.'),
        limit: z.number().int().min(1).max(50).default(10).describe('Number of results to return (1-50). Default 10. Higher values increase token usage.'),
        engines: z.array(z.enum(['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily', 'exa']))
          .min(1)
          .default(['duckduckgo', 'sogou'])
          .describe('Search engines to use (default: duckduckgo + sogou). Free engines work without API keys. ' +
            'Paid engines (brave/tavily/exa) require corresponding env vars. ' +
            'For Chinese results, include sogou or baidu.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, limit = 10, engines: userEngines }) => {
      const start = Date.now();
      try {
        const results = await searchWithFallback({
          query,
          count: limit,
          engines: userEngines,
        });
        serverMetrics.recordRequest(Date.now() - start);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
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
