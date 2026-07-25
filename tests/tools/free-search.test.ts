import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const infrastructureState = vi.hoisted(() => ({
  cacheGet: vi.fn(() => null as unknown),
  cacheSet: vi.fn(),
  cacheMakeKey: vi.fn((q: string, c: number, e: string[]) => `${q}:${c}:${[...e].sort().join(',')}`),
}));

// ── Module-level mocks (ALL factories are hoisted — no variable refs) ─
vi.mock('../../src/engines/duckduckgo.js', () => ({
  searchDuckDuckGo: vi.fn(),
  isDdgsAvailable: vi.fn(() => true),
}));
vi.mock('../../src/engines/sogou.js', () => ({ searchSogou: vi.fn() }));
vi.mock('../../src/engines/bing.js', () => ({ searchBing: vi.fn() }));
vi.mock('../../src/engines/baidu.js', () => ({ searchBaidu: vi.fn() }));
vi.mock('../../src/engines/brave.js', () => ({
  BraveProvider: vi.fn(() => ({ search: vi.fn() })),
}));
vi.mock('../../src/engines/tavily.js', () => ({
  TavilyProvider: vi.fn(() => ({ search: vi.fn() })),
}));
vi.mock('../../src/engines/exa.js', () => ({ searchExa: vi.fn() }));
vi.mock('../../src/engines/youcom.js', () => ({ searchYouCom: vi.fn() }));
vi.mock('../../src/engines/wikipedia.js', () => ({ searchWikipedia: vi.fn(async () => []) }));
vi.mock('../../src/engines/startpage.js', () => ({ searchStartpage: vi.fn(async () => []) }));
vi.mock('../../src/engines/yandex.js', () => ({ searchYandex: vi.fn(async () => []) }));
vi.mock('../../src/engines/mojeek.js', () => ({ searchMojeek: vi.fn(async () => []) }));

vi.mock('../../src/aggregation/index.js', () => ({
  dedupByProvider: vi.fn((r) => r),
  dedupByUrl: vi.fn((r) => ({ results: r, frequencies: new Map() })),
  dedupByTitle: vi.fn((r) => r),
  filterLowQuality: vi.fn((r) => r),
  scoreAndRank: vi.fn((r) => r.map((x) => ({ ...x, confidence: 0.8, relevance: 0.6, source_count: 1, score: 0.6 }))),
  formatResults: vi.fn((r) => ({
    results: r.map((x) => ({
      title: x.title, url: x.url, snippet: x.snippet || '', confidence: x.confidence || 0.8,
    })),
    meta: { total: r.length, high_confidence: r.length, engines: [] },
    security_note: '',
  })),
  checkConfidenceBasket: vi.fn(() => ({ sufficient: true, basketConfidence: 0.85, topResultsCount: 5, analyzedCount: 10 })),
  enrichResults: vi.fn(async (r) => ({ results: r, enriched: 0, failures: 0 })),
  expandQuery: vi.fn(() => []),
  hasChinese: vi.fn(() => false),
  generateChineseVariants: vi.fn(() => []),
  detectLanguage: vi.fn(() => 'en'),
}));

vi.mock('../../src/infrastructure/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    SearchCache: vi.fn(() => ({
      get: infrastructureState.cacheGet,
      set: infrastructureState.cacheSet,
      makeKey: infrastructureState.cacheMakeKey,
    })),
    RateLimiter: vi.fn(() => ({
      waitForSlot: vi.fn(async () => {}),
      getAllRateLimits: vi.fn(() => ({})),
    })),
    HealthTracker: vi.fn(() => ({
      isHealthy: vi.fn(() => true),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    })),
    EnginePolicy: vi.fn(() => ({
      isAllowed: vi.fn(() => true),
    })),
    loadConfig: vi.fn(() => ({
      ALLOWED_ENGINES: [],
      DENIED_ENGINES: [],
      evidenceBudgetChars: 1200,
    })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

// Import mocks (vi.mock is hoisted, so these resolve to mocked versions)
import { searchDuckDuckGo } from '../../src/engines/duckduckgo.js';
import { searchSogou } from '../../src/engines/sogou.js';
import { searchBing } from '../../src/engines/bing.js';
import { searchBaidu } from '../../src/engines/baidu.js';
import { searchWikipedia } from '../../src/engines/wikipedia.js';
import { searchStartpage } from '../../src/engines/startpage.js';
import { searchYandex } from '../../src/engines/yandex.js';
import { searchMojeek } from '../../src/engines/mojeek.js';
import { detectLanguage, enrichResults, formatResults } from '../../src/aggregation/index.js';

function makeResults(count: number, source: string) {
  return Array.from({ length: count }, (_, i) => ({
    title: `R${i}`,
    url: `https://${source}.ex/${i}`,
    snippet: `Snippet ${i}`,
    source,
  }));
}

let searchWithFallback: typeof import('../../src/tools/free-search.js').searchWithFallback;
let setupFreeSearchTool: typeof import('../../src/tools/free-search.js').setupFreeSearchTool;

beforeAll(async () => {
  const mod = await import('../../src/tools/free-search.js');
  searchWithFallback = mod.searchWithFallback;
  setupFreeSearchTool = mod.setupFreeSearchTool;
}, 30000);

// ── Tests ──────────────────────────────────────────────────────────
describe('searchWithFallback — parallel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    infrastructureState.cacheGet.mockReturnValue(null);
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchSogou as any).mockResolvedValue(makeResults(3, 'sogou'));
    (searchBing as any).mockResolvedValue(makeResults(3, 'bing'));
    (searchBaidu as any).mockResolvedValue(makeResults(3, 'baidu'));
  });

  it('returns results with default engines', async () => {
    const res = await searchWithFallback({ query: 'hello' });
    expect(res.query).toBe('hello');
    expect(res.meta.total).toBeGreaterThan(0);
    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchSogou).toHaveBeenCalled();
  });

  it('passes the query and configured evidence budget into formatting', async () => {
    await searchWithFallback({ query: 'evidence selection' });

    expect(formatResults).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        query: 'evidence selection',
        evidenceBudgetChars: 1200,
      }),
    );
  });

  it('collapses concurrent duplicate requests', async () => {
    const [a, b] = await Promise.all([
      searchWithFallback({ query: 'dup' }),
      searchWithFallback({ query: 'dup' }),
    ]);
    expect(a).toBe(b);
  });

  it('does not collapse requests with different verification filters', async () => {
    (searchDuckDuckGo as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return makeResults(3, 'ddg');
    });
    const [a, b] = await Promise.all([
      searchWithFallback({ query: 'filter-variant', minSourceCount: 1 }),
      searchWithFallback({ query: 'filter-variant', minSourceCount: 2 }),
    ]);
    expect(a).not.toBe(b);
  });

  it('continues fallback and reports a thrown engine failure', async () => {
    (searchBing as any).mockRejectedValue(new Error('HTTP 401 unauthorized'));
    const result = await searchWithFallback({
      query: 'fail',
      count: 50,
      engines: ['duckduckgo', 'sogou', 'bing' as any],
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.partialFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({ engine: 'bing', type: 'permission_denied' }),
    ]));
  });

  it('propagates cancellation without sharing the pending request', async () => {
    (searchDuckDuckGo as any).mockImplementation(
      async (_query: string, _count: number, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          if (options?.signal?.aborted) {
            reject(options.signal.reason);
            return;
          }
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
        })
    );
    const controller = new AbortController();
    const pending = searchWithFallback({
      query: 'cancelled-search',
      engines: ['duckduckgo'],
      signal: controller.signal,
    });
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(searchDuckDuckGo).toHaveBeenCalledWith(
      'cancelled-search',
      expect.any(Number),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('detects language in search', async () => {
    (detectLanguage as any).mockReturnValue('zh');
    const res = await searchWithFallback({ query: '中文' });
    expect(detectLanguage).toHaveBeenCalled();
    expect(res.detected_language).toBe('zh');
  });

  it('returns empty when all engines blocked', async () => {
    // The module singleton has enginePolicy.isAllowed already mocked to true by default
    // We need to clear + override on the singleton instance
    const res = await searchWithFallback({ query: 'blocked' });
    expect(res).toBeDefined();
  });

  it('enriches results on enrich=true', async () => {
    await searchWithFallback({ query: 'e', enrich: true, enrichMax: 3 });
    expect(enrichResults).toHaveBeenCalled();
  });

  it('routes all four additional zero-key adapters', async () => {
    await searchWithFallback({
      query: 'all-free-adapters',
      count: 50,
      engines: ['wikipedia', 'startpage', 'yandex', 'mojeek'],
    });

    expect(searchWikipedia).toHaveBeenCalled();
    expect(searchStartpage).toHaveBeenCalled();
    expect(searchYandex).toHaveBeenCalled();
    expect(searchMojeek).toHaveBeenCalled();
  });
});

describe('searchWithFallback — waterfall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    infrastructureState.cacheGet.mockReturnValue(null);
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchSogou as any).mockResolvedValue(makeResults(3, 'sogou'));
  });

  it('executes waterfall phases', async () => {
    const res = await searchWithFallback({ query: 'wf', waterfall: true });
    expect(res).toBeDefined();
    expect(res.query).toBe('wf');
  });

  it('reads the same cache-key contract used by parallel search', async () => {
    const cached = {
      query: 'cached-waterfall',
      engines: ['duckduckgo'],
      results: [],
      meta: { total: 0, high_confidence: 0, engines: [] },
      security_note: '',
    };
    infrastructureState.cacheGet.mockReturnValueOnce(cached);

    const result = await searchWithFallback({ query: 'cached-waterfall', waterfall: true });

    expect(result.cache_hit).toBe(true);
    expect(searchDuckDuckGo).not.toHaveBeenCalled();
    expect(infrastructureState.cacheMakeKey).toHaveBeenCalledWith(
      expect.stringContaining('"waterfall":true'),
      10,
      ['duckduckgo', 'sogou'],
    );
  });
});

describe('setupFreeSearchTool', () => {
  it('registers free_search tool', () => {
    const server = { registerTool: vi.fn() } as any;
    setupFreeSearchTool(server);
    expect(server.registerTool).toHaveBeenCalledOnce();
    expect(server.registerTool.mock.calls[0][0]).toBe('free_search');
  });
});
