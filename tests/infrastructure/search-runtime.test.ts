import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../src/infrastructure/config.js';
import {
  createSearchRuntime,
  type SearchRuntimeOverrides,
} from '../../src/infrastructure/search-runtime.js';
import { searchWithFallback } from '../../src/tools/free-search.js';
import type { SearchProvider, SearchResult } from '../../src/types.js';

function createRuntime(
  title: string,
  overrides: Pick<SearchRuntimeOverrides, 'config'> = {},
) {
  const searchProvider = vi.fn(async (
    provider: SearchProvider,
  ): Promise<SearchResult[]> => [{
    title,
    url: `https://example.com/${title.toLowerCase()}`,
    snippet: `${title} is a sufficiently detailed developer reference result.`,
    source: provider,
  }]);
  const cache = {
    get: vi.fn(() => null),
    set: vi.fn(),
    stats: vi.fn(() => ({ hits: 0, misses: 0, size: 0, maxSize: 10 })),
  };
  const healthTracker = {
    getAvailability: vi.fn(() => ({ available: true } as const)),
    getHealth: vi.fn(() => []),
    isHealthy: vi.fn(() => true),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    suspend: vi.fn(),
  };

  const runtime = createSearchRuntime({
    config: overrides.config ?? loadConfig(),
    cache,
    healthTracker,
    serverMetrics: {
      getMetrics: vi.fn(() => ({
        uptime: 0,
        memory: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0 },
        requestCount: 0,
        avgLatency: 0,
        cacheHitRate: -1,
        cacheStats: { hits: 0, misses: 0, size: 0, maxSize: 10 },
      })),
      recordRequest: vi.fn(),
    },
    rateLimiter: {
      getAllRateLimits: vi.fn(() => ({})),
      waitForSlot: vi.fn(async () => undefined),
    },
    enginePolicy: { isAllowed: vi.fn(() => true) },
    searchProvider,
  });

  return { runtime, searchProvider };
}

describe('SearchRuntime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps request collapsing scoped to one runtime', async () => {
    const first = createRuntime('First Runtime');
    const second = createRuntime('Second Runtime');
    const options = {
      query: 'runtime isolation',
      count: 1,
      engines: ['wikipedia'] as SearchProvider[],
      expandQueries: false,
    };

    const [firstResponse, secondResponse] = await Promise.all([
      searchWithFallback(options, first.runtime),
      searchWithFallback(options, second.runtime),
    ]);

    expect(first.searchProvider).toHaveBeenCalledOnce();
    expect(second.searchProvider).toHaveBeenCalledOnce();
    expect(firstResponse.results[0]?.title).toBe('First Runtime');
    expect(secondResponse.results[0]?.title).toBe('Second Runtime');
  });

  it('enforces a runtime free-only policy before dispatching a paid provider', async () => {
    vi.stubEnv('BRAVE_API_KEY', 'test-only');
    const config = {
      ...loadConfig(),
      searchProviderMode: 'free_only' as const,
    };
    const { runtime, searchProvider } = createRuntime('Forbidden', { config });

    const response = await searchWithFallback({
      query: 'paid provider policy',
      count: 1,
      engines: ['brave'],
      expandQueries: false,
    }, runtime);

    expect(searchProvider).not.toHaveBeenCalled();
    expect(response.partialFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({ engine: 'brave', type: 'permission_denied' }),
    ]));
  });
});
