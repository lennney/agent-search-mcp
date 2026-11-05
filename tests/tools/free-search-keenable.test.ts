import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { optionalEngineCredentialEnvironment, paidEngines } from '../../src/engines/provider-catalog.js';
import { searchProvider } from '../../src/engines/runtime-registry.js';
import { loadConfig, type Config } from '../../src/infrastructure/config.js';
import { HealthTracker } from '../../src/infrastructure/health.js';
import { createSearchRuntime } from '../../src/infrastructure/search-runtime.js';
import { searchWithFallback } from '../../src/tools/free-search.js';
import type { EngineSearchOptions, SearchProvider } from '../../src/types.js';

const fetchMock = vi.fn<typeof fetch>();

function makeRuntime(config: Partial<Config> = {}) {
  const healthTracker = new HealthTracker();
  // Exercise the real registry and adapter for Keenable. Other providers are
  // empty, offline stand-ins so policy tests never contact external services.
  const dispatch = vi.fn(async (engine: SearchProvider, query: string, count: number, options?: EngineSearchOptions) => (
    engine === 'keenable' ? searchProvider(engine, query, count, options) : []
  ));
  const runtime = createSearchRuntime({
    config: { ...loadConfig(), semanticDedup: false, semanticRerank: false, ...config },
    healthTracker,
    cache: {
      get: () => null, set: () => undefined,
      stats: () => ({ hits: 0, misses: 0, size: 0, maxSize: 10 }),
    },
    rateLimiter: { waitForSlot: async () => undefined, getAllRateLimits: () => ({}) },
    searchProvider: dispatch,
  });
  return { runtime, dispatch, healthTracker };
}

beforeEach(() => {
  for (const name of Object.values(optionalEngineCredentialEnvironment)) vi.stubEnv(name, '');
  vi.stubEnv('KEENABLE_API_KEY', 'test-key');
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const request = { query: 'Keenable integration', engines: ['keenable'] as SearchProvider[], expandQueries: false };

describe('Keenable through the search orchestrator', () => {
  it.each(['503', 'timeout', 'body timeout', 'transport'])('retries a transient %s then records success', async kind => {
    if (kind === '503') fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    else if (kind === 'body timeout') {
      const controller = new AbortController();
      vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
      const response = Response.json({ results: [] });
      vi.spyOn(response, 'json').mockImplementation(async () => {
        controller.abort(new DOMException('body read timed out', 'TimeoutError'));
        throw controller.signal.reason;
      });
      fetchMock.mockResolvedValueOnce(response);
    } else fetchMock.mockRejectedValueOnce(kind === 'timeout'
      ? new DOMException('operation timed out', 'TimeoutError')
      : new TypeError('fetch failed'));
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }));
    const { runtime, healthTracker } = makeRuntime();
    const response = await searchWithFallback(request, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.partialFailures).toBeUndefined();
    expect(response.meta.execution?.budget?.observed.engine_calls).toBe(2);
    expect(healthTracker.getHealth()).toContainEqual(expect.objectContaining({
      provider: 'keenable', errorCount: 0, lastSuccess: expect.any(Number), isHealthy: true,
    }));
  });

  it('bounds retries and records a single logical provider failure', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const { runtime, healthTracker } = makeRuntime();
    const response = await searchWithFallback({ ...request, providerMaxRetries: 1 }, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.partialFailures).toContainEqual(expect.objectContaining({ engine: 'keenable', type: 'upstream_5xx' }));
    expect(healthTracker.getHealth()).toContainEqual(expect.objectContaining({ provider: 'keenable', errorCount: 1 }));
  });

  it('suspends on 429 and suppresses another request during Retry-After', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '42' } }));
    const { runtime, healthTracker } = makeRuntime();
    const before = Date.now();
    const response = await searchWithFallback(request, runtime);
    const health = healthTracker.getHealth().find(item => item.provider === 'keenable');
    expect(response.partialFailures).toContainEqual(expect.objectContaining({ engine: 'keenable', type: 'rate_limited' }));
    expect(health?.suspensionFailureType).toBe('rate_limited');
    expect(health?.suspendedUntil).toBeGreaterThanOrEqual(before + 42_000);
    await searchWithFallback({ ...request, query: 'another query during cooldown' }, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 400, 501])('does not retry HTTP %i', async status => {
    fetchMock.mockResolvedValue(new Response('', { status }));
    const { runtime } = makeRuntime();
    const response = await searchWithFallback(request, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.partialFailures).toHaveLength(1);
  });

  it.each(['malformed', 'invalid shape'])('does not retry %s responses', async kind => {
    fetchMock.mockResolvedValue(kind === 'malformed' ? new Response('{') : Response.json({}));
    const { runtime } = makeRuntime();
    const response = await searchWithFallback(request, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.partialFailures).toContainEqual(expect.objectContaining({ type: 'parse_error' }));
  });

  it('stops retries and fallback on caller cancellation without a health penalty', async () => {
    const controller = new AbortController();
    const reason = new Error('Caller stopped the search');
    vi.stubEnv('BRAVE_API_KEY', 'another-test-key');
    fetchMock.mockImplementation(async (_input, init) => {
      controller.abort(reason);
      expect(init?.signal?.reason).toBe(reason);
      throw reason;
    });
    const { runtime, dispatch, healthTracker } = makeRuntime({ paidEngineOrder: ['keenable', 'brave'] });
    await expect(searchWithFallback({
      ...request, engines: ['keenable', 'brave'], waterfall: true, count: 1, signal: controller.signal,
    }, runtime)).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls.map(call => call[0])).toEqual(['keenable']);
    expect(healthTracker.getHealth()).toEqual([]);
  });

  it('honors the shared call budget instead of retrying beyond it', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { runtime, healthTracker } = makeRuntime({ searchBudgetMaxCalls: 1 });
    const response = await searchWithFallback(request, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.meta.execution?.budget?.exhausted_reasons).toContain('engine_calls');
    expect(healthTracker.getHealth()).toEqual([]);
  });

  it('honors the shared elapsed budget without retrying or penalizing health', async () => {
    fetchMock.mockImplementation(async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const { runtime, healthTracker } = makeRuntime({ searchBudgetMaxElapsedMs: 20 });
    const response = await searchWithFallback(request, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.meta.execution?.budget?.exhausted_reasons).toContain('elapsed_ms');
    expect(healthTracker.getHealth()).toEqual([]);
  });

  for (const mode of ['free_first', 'free_only'] as const) {
    it.each([false, true])(`${mode} does not automatically call paid providers (waterfall=%s)`, async waterfall => {
      for (const name of Object.values(optionalEngineCredentialEnvironment)) vi.stubEnv(name, 'dummy-key');
      const { runtime, dispatch } = makeRuntime({ searchProviderMode: mode });
      await searchWithFallback({ query: 'offline policy check', waterfall, expandQueries: false }, runtime);
      expect(dispatch.mock.calls.every(call => !paidEngines.includes(call[0]))).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it.each([false, true])('free_only blocks explicit Keenable (waterfall=%s)', async waterfall => {
    const { runtime, dispatch } = makeRuntime({ searchProviderMode: 'free_only' });
    const response = await searchWithFallback({ ...request, waterfall }, runtime);
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.partialFailures).toContainEqual(expect.objectContaining({ type: 'permission_denied' }));
  });
});
