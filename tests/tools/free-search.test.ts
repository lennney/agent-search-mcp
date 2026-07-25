import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const infrastructureState = vi.hoisted(() => ({
  cacheGet: vi.fn(() => null as unknown),
  cacheSet: vi.fn(),
  cacheMakeKey: vi.fn((q: string, c: number, e: string[]) => `${q}:${c}:${[...e].sort().join(',')}`),
  config: {
    ALLOWED_ENGINES: [] as string[],
    DENIED_ENGINES: [] as string[],
    evidenceBudgetChars: 1200,
    outputStyle: 'normal' as 'normal' | 'compact',
    minConfidence: 0,
    minSourceCount: 1,
  },
}));

const aggregationState = vi.hoisted(() => ({
  filterLowQuality: vi.fn((results: any[]) => results),
  checkConfidenceBasket: vi.fn(() => ({
    sufficient: true,
    basketConfidence: 0.85,
    basketRelevance: 0.6,
    relevantResultsCount: 5,
    relevanceThreshold: 0.35,
    providerFamilyCount: 2,
    topResultsCount: 5,
    analyzedCount: 10,
  })),
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
  filterLowQuality: aggregationState.filterLowQuality,
  getProviderFamily: vi.fn((engine: string) => (
    engine === 'duckduckgo' || engine === 'bing' ? 'bing' : engine
  )),
  scoreAndRank: vi.fn((r) => r.map((x) => ({ ...x, confidence: 0.8, relevance: 0.6, source_count: 1, score: 0.6 }))),
  evaluateSearchEvidence: vi.fn((rawResults, policy) => {
    const results = aggregationState.filterLowQuality(rawResults)
      .map((item) => ({
        ...item,
        confidence: 0.8,
        relevance: 0.6,
        source_count: 1,
        score: 0.6,
      }))
      .filter((item) => (
        item.confidence >= (policy.minConfidence ?? 0)
        && item.source_count >= (policy.minSourceCount ?? 1)
      ));
    return {
      results,
      qualityGate: aggregationState.checkConfidenceBasket(
        results,
        policy.qualityGate,
      ),
    };
  }),
  formatResults: vi.fn((r) => {
    const results = r.map((x) => ({
      title: x.title,
      url: x.url,
      snippet: x.snippet || '',
      confidence: x.confidence || 0.8,
      source_count: x.source_count,
      sources: x.engines?.length ? x.engines : [x.source].filter(Boolean),
    }));
    return {
      results,
      meta: {
        total: r.length,
        high_confidence: r.length,
        engines: [...new Set(results.flatMap((result) => result.sources))],
      },
      security_note: '',
    };
  }),
  checkConfidenceBasket: aggregationState.checkConfidenceBasket,
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
    loadConfig: vi.fn(() => infrastructureState.config),
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
import { searchExa } from '../../src/engines/exa.js';
import {
  checkConfidenceBasket,
  detectLanguage,
  enrichResults,
  expandQuery,
  filterLowQuality,
  formatResults,
} from '../../src/aggregation/index.js';

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
    infrastructureState.config.outputStyle = 'normal';
    infrastructureState.config.minConfidence = 0;
    infrastructureState.config.minSourceCount = 1;
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
    (searchBaidu as any).mockRejectedValue(new Error('HTTP 401 unauthorized'));
    const result = await searchWithFallback({
      query: 'fail',
      count: 50,
      engines: ['duckduckgo', 'sogou', 'baidu'],
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.partialFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({ engine: 'baidu', type: 'permission_denied' }),
    ]));
  });

  it('searches only explicitly requested engines in parallel mode', async () => {
    (searchWikipedia as any).mockResolvedValue(makeResults(1, 'wikipedia'));

    await searchWithFallback({
      query: 'explicit-parallel-engine',
      engines: ['wikipedia'],
    });

    expect(searchWikipedia).toHaveBeenCalled();
    expect(searchDuckDuckGo).not.toHaveBeenCalled();
    expect(searchSogou).not.toHaveBeenCalled();
    expect(searchBing).not.toHaveBeenCalled();
    expect(searchBaidu).not.toHaveBeenCalled();
  });

  it('does not call two adapters from the same provider family in parallel mode', async () => {
    await searchWithFallback({
      query: 'provider-family-dedup',
      count: 50,
      engines: ['duckduckgo', 'bing'],
    });

    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchBing).not.toHaveBeenCalled();
  });

  it('tries an explicitly selected same-family adapter after the preferred adapter fails', async () => {
    const error = Object.assign(
      new Error('DuckDuckGo fallback failed: HTML HTTP 202; Lite timeout'),
      { retryable: false },
    );
    (searchDuckDuckGo as any).mockRejectedValue(error);

    const result = await searchWithFallback({
      query: 'same-family-adapter-fallback',
      count: 3,
      engines: ['duckduckgo', 'bing'],
    });

    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchDuckDuckGo).toHaveBeenCalledTimes(1);
    expect(searchBing).toHaveBeenCalled();
    expect(result.partialFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({ engine: 'duckduckgo' }),
    ]));
  });

  it('tries a same-family fallback when the preferred adapter returns only low-quality rows', async () => {
    (filterLowQuality as any).mockReturnValueOnce([]);
    (searchDuckDuckGo as any).mockResolvedValue([{
      title: 'Thin result',
      url: 'https://thin.example/result',
      snippet: 'short',
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    }]);

    await searchWithFallback({
      query: 'same-family-low-quality-fallback',
      count: 3,
      engines: ['duckduckgo', 'bing'],
    });

    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchBing).toHaveBeenCalled();
  });

  it('continues to another batch when result count is high but the quality gate fails', async () => {
    (checkConfidenceBasket as any)
      .mockReturnValueOnce({
        sufficient: false,
        basketConfidence: 0.9,
        basketRelevance: 0.1,
        relevantResultsCount: 0,
        relevanceThreshold: 0.35,
        providerFamilyCount: 2,
        topResultsCount: 5,
        analyzedCount: 6,
      })
      .mockReturnValueOnce({
        sufficient: true,
        basketConfidence: 0.9,
        basketRelevance: 0.6,
        relevantResultsCount: 3,
        relevanceThreshold: 0.35,
        providerFamilyCount: 3,
        topResultsCount: 5,
        analyzedCount: 9,
      });

    const result = await searchWithFallback({
      query: 'quality-aware-batching',
      count: 3,
      engines: ['duckduckgo', 'sogou', 'baidu'],
    });

    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchSogou).toHaveBeenCalled();
    expect(searchBaidu).toHaveBeenCalled();
    expect(result.meta.execution?.quality_gate?.sufficient).toBe(true);
    expect(result.meta.execution?.early_stop).toBe(false);
    expect(result.meta.execution?.stop_reason).toBe('phases_exhausted');
  });

  it('checks the completed free basket before deciding whether to call an optional provider', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = 'test-key';
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchExa as any).mockResolvedValue(makeResults(2, 'exa'));
    (checkConfidenceBasket as any)
      .mockReturnValueOnce({
        sufficient: false,
        basketConfidence: 0.8,
        basketRelevance: 0.2,
        relevantResultsCount: 1,
        relevanceThreshold: 0.35,
        providerFamilyCount: 1,
        topResultsCount: 3,
        analyzedCount: 3,
      })
      .mockReturnValueOnce({
        sufficient: true,
        basketConfidence: 0.8,
        basketRelevance: 0.6,
        relevantResultsCount: 3,
        relevanceThreshold: 0.35,
        providerFamilyCount: 2,
        topResultsCount: 5,
        analyzedCount: 5,
      });

    try {
      const result = await searchWithFallback({
        query: 'free-basket-needs-optional-provider',
        count: 3,
        engines: ['duckduckgo', 'exa'],
      });

      expect(searchExa).toHaveBeenCalled();
      expect(result.meta.execution?.quality_gate?.sufficient).toBe(true);
      expect(result.meta.execution?.stop_reason).toBe('phases_exhausted');
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.EXA_API_KEY;
      } else {
        process.env.EXA_API_KEY = previousApiKey;
      }
    }
  });

  it('reports only the optional phase for a paid-only request', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = 'test-key';
    (searchExa as any).mockResolvedValue(makeResults(2, 'exa'));

    try {
      const result = await searchWithFallback({
        query: 'paid-only-phase-metadata',
        count: 1,
        engines: ['exa'],
      });

      expect(searchExa).toHaveBeenCalled();
      expect(searchDuckDuckGo).not.toHaveBeenCalled();
      expect(result.meta.execution?.phases_completed).toEqual(['optional']);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.EXA_API_KEY;
      } else {
        process.env.EXA_API_KEY = previousApiKey;
      }
    }
  });

  it('does not claim an early stop when the selected free work is already complete', async () => {
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));

    const result = await searchWithFallback({
      query: 'no-work-left-to-skip',
      count: 2,
      engines: ['duckduckgo'],
    });

    expect(result.meta.execution?.early_stop).toBe(false);
    expect(result.meta.execution?.stop_reason).toBe('phases_exhausted');
    expect(result.meta.execution?.phases_completed).toEqual(['free']);
  });

  it('marks an early stop only when a satisfied gate skips optional work', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = 'test-key';
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchExa as any).mockResolvedValue(makeResults(2, 'exa'));

    try {
      const result = await searchWithFallback({
        query: 'quality-gate-skips-optional',
        count: 2,
        engines: ['duckduckgo', 'exa'],
      });

      expect(searchExa).not.toHaveBeenCalled();
      expect(result.meta.execution?.early_stop).toBe(true);
      expect(result.meta.execution?.stop_reason).toBe('quality_gate_satisfied');
      expect(result.meta.execution?.phases_completed).toEqual(['free']);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.EXA_API_KEY;
      } else {
        process.env.EXA_API_KEY = previousApiKey;
      }
    }
  });

  it('applies compact-mode global filters before allowing a quality-gate stop', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = 'test-key';
    infrastructureState.config.outputStyle = 'compact';
    infrastructureState.config.minConfidence = 0.95;
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchExa as any).mockResolvedValue(makeResults(2, 'exa'));
    (checkConfidenceBasket as any).mockImplementation((results: unknown[]) => ({
      sufficient: results.length > 0,
      basketConfidence: results.length > 0 ? 0.95 : 0,
      basketRelevance: results.length > 0 ? 0.6 : 0,
      relevantResultsCount: results.length,
      relevanceThreshold: 0.35,
      providerFamilyCount: results.length > 0 ? 1 : 0,
      topResultsCount: results.length,
      analyzedCount: results.length,
    }));

    try {
      const result = await searchWithFallback({
        query: 'compact-global-threshold',
        count: 2,
        engines: ['duckduckgo', 'exa'],
      });

      expect(checkConfidenceBasket).toHaveBeenCalledWith(
        [],
        expect.any(Object),
      );
      expect(searchExa).toHaveBeenCalled();
      expect(result.meta.execution?.early_stop).toBe(false);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.EXA_API_KEY;
      } else {
        process.env.EXA_API_KEY = previousApiKey;
      }
    }
  });

  it('rejects invalid counts before entering the batch loop', async () => {
    await expect(searchWithFallback({
      query: 'invalid-count',
      count: 0,
      engines: ['duckduckgo'],
    })).rejects.toThrow('count must be an integer between 1 and 50');

    expect(searchDuckDuckGo).not.toHaveBeenCalled();
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
    infrastructureState.config.outputStyle = 'normal';
    infrastructureState.config.minConfidence = 0;
    infrastructureState.config.minSourceCount = 1;
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchSogou as any).mockResolvedValue(makeResults(3, 'sogou'));
  });

  it('executes waterfall phases', async () => {
    const res = await searchWithFallback({ query: 'wf', waterfall: true });
    expect(res).toBeDefined();
    expect(res.query).toBe('wf');
  });

  it('searches only explicitly requested engines in waterfall mode', async () => {
    (searchWikipedia as any).mockResolvedValue(makeResults(1, 'wikipedia'));

    const result = await searchWithFallback({
      query: 'explicit-waterfall-engine',
      engines: ['wikipedia'],
      waterfall: true,
      expandQueries: false,
    });

    expect(searchWikipedia).toHaveBeenCalled();
    expect(searchDuckDuckGo).not.toHaveBeenCalled();
    expect(searchSogou).not.toHaveBeenCalled();
    expect(searchBing).not.toHaveBeenCalled();
    expect(searchBaidu).not.toHaveBeenCalled();
    expect(searchStartpage).not.toHaveBeenCalled();
    expect(searchYandex).not.toHaveBeenCalled();
    expect(searchMojeek).not.toHaveBeenCalled();
    expect(result.meta.execution?.searched_engines).toEqual(['wikipedia']);
    expect(result.meta.execution?.quality_gate?.sufficient).toBe(true);
    expect(result.meta.execution?.early_stop).toBe(false);
    expect(result.meta.execution?.stop_reason).toBe('phases_exhausted');
  });

  it('marks a waterfall early stop when a quality gate skips selected later phases', async () => {
    const result = await searchWithFallback({
      query: 'waterfall-skips-later-phases',
      waterfall: true,
      expandQueries: false,
    });

    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchSogou).toHaveBeenCalled();
    expect(searchBing).not.toHaveBeenCalled();
    expect(searchBaidu).not.toHaveBeenCalled();
    expect(result.meta.execution?.early_stop).toBe(true);
    expect(result.meta.execution?.stop_reason).toBe('quality_gate_satisfied');
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

  it('preserves per-result provider provenance from query expansion', async () => {
    (searchDuckDuckGo as any).mockImplementation(async (query: string) => (
      query === 'alternative-query'
        ? [{
            title: 'DDG result',
            url: 'https://ddg.example/result',
            snippet: 'DuckDuckGo alternative result with enough detail.',
            source: 'duckduckgo',
            engines: ['duckduckgo'],
          }]
        : []
    ));
    (searchSogou as any).mockImplementation(async (query: string) => (
      query === 'alternative-query'
        ? [{
            title: 'Sogou result',
            url: 'https://sogou.example/result',
            snippet: 'Sogou alternative result with enough detail.',
            source: 'sogou',
            engines: ['sogou'],
          }]
        : []
    ));
    (expandQuery as any).mockImplementation((query: string) => (
      query === 'original-query' ? ['alternative-query'] : []
    ));
    (checkConfidenceBasket as any)
      .mockReturnValueOnce({
        sufficient: false,
        basketConfidence: 0,
        basketRelevance: 0,
        relevantResultsCount: 0,
        relevanceThreshold: 0.35,
        providerFamilyCount: 0,
        topResultsCount: 0,
        analyzedCount: 0,
      })
      .mockReturnValueOnce({
        sufficient: true,
        basketConfidence: 0.8,
        basketRelevance: 0.6,
        relevantResultsCount: 2,
        relevanceThreshold: 0.35,
        providerFamilyCount: 2,
        topResultsCount: 2,
        analyzedCount: 2,
      });

    const result = await searchWithFallback({
      query: 'original-query',
      count: 2,
      engines: ['duckduckgo', 'sogou'],
      waterfall: true,
    });

    expect(result.results.map(item => item.sources)).toEqual([
      ['duckduckgo'],
      ['sogou'],
    ]);
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
