import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchDuckDuckGo } from '../engines/duckduckgo.js';
import { searchSogou } from '../engines/sogou.js';
import { BraveProvider } from '../engines/brave.js';
import { TavilyProvider } from '../engines/tavily.js';
import type { SearchResult, SearchProvider } from '../types.js';
import { dedupByUrl, dedupByTitle, scoreAndRank, formatResults } from '../aggregation/index.js';
import { SearchCache, logger, HealthTracker, RateLimiter } from '../infrastructure/index.js';

const SUPPORTED_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'brave', 'tavily'];
const FREE_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou'];
const PAID_ENGINES: SearchProvider[] = ['brave', 'tavily'];

// Infrastructure singletons
const cache = new SearchCache();
const healthTracker = new HealthTracker();
const rateLimiter = new RateLimiter();

async function searchEngine(engine: SearchProvider, query: string, limit: number): Promise<SearchResult[]> {
  // Skip unhealthy providers
  if (!healthTracker.isHealthy(engine)) {
    logger.warn({ engine }, 'Skipping unhealthy provider');
    return [];
  }

  // Rate limit before making the request
  await rateLimiter.waitForSlot(engine);

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
      case 'brave':
        results = await new BraveProvider().search(query, limit);
        break;
      case 'tavily':
        results = await new TavilyProvider().search(query, limit);
        break;
      default:
        return [];
    }
    const latency = Date.now() - startTime;
    healthTracker.recordSuccess(engine, latency);
    logger.info({ engine, latency, count: results.length }, 'Search completed');
    return results;
  } catch (err) {
    const latency = Date.now() - startTime;
    healthTracker.recordFailure(engine);
    logger.error({ engine, latency, err: err instanceof Error ? err.message : String(err) }, 'Search failed');
    return [];
  }
}

/**
 * Check if a paid engine has its API key configured
 */
function hasApiKey(engine: SearchProvider): boolean {
  switch (engine) {
    case 'brave':
      return !!process.env.BRAVE_API_KEY;
    case 'tavily':
      return !!process.env.TAVILY_API_KEY;
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
}

interface FormattedResult {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
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
  partialFailures?: { engine: string; message: string }[];
}

// ─── Core search logic (shared between tools) ───────────────────────────

export async function searchWithFallback(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  const {
    query,
    count = 10,
    engines: userEngines = ['duckduckgo' as SearchProvider],
    minConfidence = 1,
    language,
    includeDomains,
    excludeDomains,
  } = options;

  // Check cache first
  const cacheKey = cache.makeKey(query, count, userEngines);
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query, count, engines: userEngines }, 'Cache hit');
    return cached as SearchResponse;
  }

  logger.info({ query, count, engines: userEngines }, 'Starting search');

  // --- Phase 1: Search all free engines in parallel ---
  const phase1Engines = FREE_ENGINES.filter(e => userEngines.includes(e));
  const freeToSearch = phase1Engines.length > 0 ? phase1Engines : FREE_ENGINES;

  logger.info({ engines: freeToSearch }, 'Phase 1: free engines');
  const phase1Results = await Promise.all(
    freeToSearch.map(async (engine) => {
      const results = await searchEngine(engine, query, count);
      return { engine, results, error: null };
    })
  );

  let allResults = phase1Results.flatMap(r => r.results);
  const failures: { engine: string; message: string }[] = [];

  logger.info({ count: allResults.length }, 'Phase 1 results');

  // --- Phase 2: Fallback to paid engines if not enough results ---
  if (allResults.length < count) {
    const phase2Engines = PAID_ENGINES.filter(
      e => userEngines.includes(e) && hasApiKey(e)
    );

    if (phase2Engines.length > 0) {
      const remaining = Math.max(count - allResults.length, 1);
      logger.info({ engines: phase2Engines, remaining }, 'Phase 2: paid engines');

      const phase2Results = await Promise.all(
        phase2Engines.map(async (engine) => {
          const results = await searchEngine(engine, query, remaining);
          return { engine, results, error: null };
        })
      );

      const phase2Success = phase2Results.flatMap(r => r.results);
      allResults = [...allResults, ...phase2Success];

      logger.info({ got: phase2Success.length, total: allResults.length }, 'Phase 2 results');
    } else {
      logger.info('Phase 2: no paid engines available');
    }
  }

  // Apply aggregation layer
  let deduped = dedupByUrl(allResults);
  deduped = dedupByTitle(deduped);
  let scored = scoreAndRank(deduped, query, {});

  // Apply post-search filters
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

  const formatted = formatResults(scored);

  const response = {
    query,
    engines: userEngines,
    ...formatted,
    ...(failures.length > 0
      ? { partialFailures: failures }
      : {}),
  } as SearchResponse;

  // Cache the response
  cache.set(cacheKey, response);
  logger.info({ total: response.meta.total }, 'Search complete');

  return response;
}

// ─── Tool registration ──────────────────────────────────────────────────

// Export the health tracker instance so index.ts can use the same singleton
export { healthTracker };

export function setupFreeSearchTool(server: McpServer): void {
  server.tool(
    'free_search',
    'Search the web with automatic fallback between free and paid engines. ' +
    'Phase 1: DuckDuckGo + Sogou (free, no key required). ' +
    'Phase 2: Brave + Tavily (paid, requires BRAVE_API_KEY / TAVILY_API_KEY env vars). ' +
    'All results are deduplicated, scored, and ranked.',
    {
      query: z.string().min(1, 'Search query must not be empty'),
      limit: z.number().int().min(1).max(50).default(10).describe('Number of results to return (1-50)'),
      engines: z.array(z.enum(['duckduckgo', 'sogou', 'brave', 'tavily']))
        .min(1)
        .default(['duckduckgo'])
        .describe('Search engines to use (default: duckduckgo)'),
    },
    async ({ query, limit = 10, engines: userEngines }) => {
      try {
        const results = await searchWithFallback({
          query,
          count: limit,
          engines: userEngines,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
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
