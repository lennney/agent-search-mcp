import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../src/infrastructure/config.js';
import { HealthTracker } from '../../src/infrastructure/health.js';
import {
  createSearchRuntime,
  type SearchRuntimeOverrides,
} from '../../src/infrastructure/search-runtime.js';
import { searchWithFallback } from '../../src/tools/free-search.js';
import type {
  EngineSearchOptions,
  SearchProvider,
  SearchResult,
} from '../../src/types.js';

function createRuntime(
  title: string,
  overrides: Pick<
    SearchRuntimeOverrides,
    'config' | 'healthTracker' | 'rateLimiter' | 'searchProvider'
  > = {},
) {
  const defaultSearchProvider = vi.fn(async (
    provider: SearchProvider,
  ): Promise<SearchResult[]> => [{
    title,
    url: `https://example.com/${title.toLowerCase()}`,
    snippet: `${title} is a sufficiently detailed developer reference result.`,
    source: provider,
  }]);
  const searchProvider = overrides.searchProvider ?? defaultSearchProvider;
  const cache = {
    get: vi.fn(() => null),
    set: vi.fn(),
    stats: vi.fn(() => ({ hits: 0, misses: 0, size: 0, maxSize: 10 })),
  };
  const healthTracker = {
    acquireAttempt: vi.fn(() => ({
      acquired: true,
      lease: { finish: vi.fn() },
    } as const)),
    getHealth: vi.fn(() => []),
    isHealthy: vi.fn(() => true),
  };

  const runtime = createSearchRuntime({
    config: overrides.config ?? loadConfig(),
    cache,
    healthTracker: overrides.healthTracker ?? healthTracker,
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
    rateLimiter: overrides.rateLimiter ?? {
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
    vi.restoreAllMocks();
  });

  it('dispatches only one concurrent half-open probe', async () => {
    let now = Date.parse('2026-08-07T00:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const healthTracker = new HealthTracker();
    for (let attempt = 0; attempt < 5; attempt++) {
      healthTracker.recordFailure('wikipedia');
    }
    now += 30_000;

    let finishProvider: ((results: SearchResult[]) => void) | undefined;
    const searchProvider = vi.fn(async (): Promise<SearchResult[]> => (
      new Promise(resolve => {
        finishProvider = resolve;
      })
    ));
    const { runtime } = createRuntime('Half Open', {
      healthTracker,
      searchProvider,
    });

    const first = searchWithFallback({
      query: 'first half-open request',
      count: 1,
      engines: ['wikipedia'],
      expandQueries: false,
    }, runtime);
    await vi.waitFor(() => expect(searchProvider).toHaveBeenCalledOnce());

    const second = await searchWithFallback({
      query: 'second half-open request',
      count: 1,
      engines: ['wikipedia'],
      expandQueries: false,
    }, runtime);

    expect(searchProvider).toHaveBeenCalledOnce();
    expect(second.partialFailures).toContainEqual(expect.objectContaining({
      engine: 'wikipedia',
      type: 'unknown',
    }));

    finishProvider?.([{
      title: 'Recovered',
      url: 'https://example.com/recovered',
      snippet: 'Recovered provider result with enough developer context.',
      source: 'wikipedia',
    }]);
    await first;
    expect(healthTracker.getHealth()[0]?.circuitState).toBe('closed');
  });

  it('releases the half-open probe when rate-limit waiting fails', async () => {
    let now = Date.parse('2026-08-07T00:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const healthTracker = new HealthTracker();
    for (let attempt = 0; attempt < 5; attempt++) {
      healthTracker.recordFailure('wikipedia');
    }
    now += 30_000;
    const searchProvider = vi.fn(async (): Promise<SearchResult[]> => []);
    const { runtime } = createRuntime('Rate Limit Wait', {
      healthTracker,
      searchProvider,
      rateLimiter: {
        getAllRateLimits: vi.fn(() => ({})),
        waitForSlot: vi.fn(async () => {
          throw new Error('rate limiter unavailable');
        }),
      },
    });

    const response = await searchWithFallback({
      query: 'rate-limit release',
      count: 1,
      engines: ['wikipedia'],
      expandQueries: false,
    }, runtime);

    expect(searchProvider).not.toHaveBeenCalled();
    expect(response.partialFailures).toContainEqual(expect.objectContaining({
      engine: 'wikipedia',
      message: 'rate limiter unavailable',
    }));
    const next = healthTracker.acquireAttempt('wikipedia');
    expect(next.acquired).toBe(true);
    if (next.acquired) next.lease.finish({ status: 'released' });
  });

  it('releases the half-open probe when the caller cancels', async () => {
    let now = Date.parse('2026-08-07T00:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const healthTracker = new HealthTracker();
    for (let attempt = 0; attempt < 5; attempt++) {
      healthTracker.recordFailure('wikipedia');
    }
    now += 30_000;
    const searchProvider = vi.fn(async (
      _provider: SearchProvider,
      _query: string,
      _count: number,
      options?: EngineSearchOptions,
    ): Promise<SearchResult[]> => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener(
        'abort',
        () => reject(options.signal?.reason),
        { once: true },
      );
    }));
    const { runtime } = createRuntime('Cancellation', {
      healthTracker,
      searchProvider,
    });
    const controller = new AbortController();

    const pending = searchWithFallback({
      query: 'cancel half-open probe',
      count: 1,
      engines: ['wikipedia'],
      expandQueries: false,
      signal: controller.signal,
    }, runtime);
    await vi.waitFor(() => expect(searchProvider).toHaveBeenCalledOnce());
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const next = healthTracker.acquireAttempt('wikipedia');
    expect(next.acquired).toBe(true);
    if (next.acquired) next.lease.finish({ status: 'released' });
  });

  it('releases the half-open probe when the request budget rejects dispatch', async () => {
    let now = Date.parse('2026-08-07T00:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const healthTracker = new HealthTracker();
    for (let attempt = 0; attempt < 5; attempt++) {
      healthTracker.recordFailure('wikipedia');
    }
    now += 30_000;
    const config = {
      ...loadConfig(),
      searchBudgetMaxCalls: 1,
    };
    const searchProvider = vi.fn(async (
      provider: SearchProvider,
    ): Promise<SearchResult[]> => [{
      title: 'Budget winner',
      url: 'https://example.com/budget-winner',
      snippet: 'The first admitted provider consumes the only adapter attempt.',
      source: provider,
    }]);
    const { runtime } = createRuntime('Budget', {
      config,
      healthTracker,
      searchProvider,
    });

    const response = await searchWithFallback({
      query: 'budget releases probe',
      count: 1,
      engines: ['duckduckgo', 'wikipedia'],
      expandQueries: false,
    }, runtime);

    expect(searchProvider).toHaveBeenCalledOnce();
    expect(response.meta.execution?.budget).toMatchObject({
      exhausted: true,
      exhausted_reasons: ['engine_calls'],
    });
    const next = healthTracker.acquireAttempt('wikipedia');
    expect(next.acquired).toBe(true);
    if (next.acquired) next.lease.finish({ status: 'released' });
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
