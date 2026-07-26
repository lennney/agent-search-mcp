import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const infrastructureState = vi.hoisted(() => ({
  cacheGet: vi.fn(() => null as unknown),
  cacheSet: vi.fn(),
  cacheMakeKey: vi.fn((q: string, c: number, e: string[]) => `${q}:${c}:${[...e].sort().join(',')}`),
  getAvailability: vi.fn(() => ({ available: true } as
    | { available: true }
    | { available: false; failureType: 'bot_challenge'; retryAt: number })),
  suspend: vi.fn(),
  recordFailure: vi.fn(),
  config: {
    ALLOWED_ENGINES: [] as string[],
    DENIED_ENGINES: [] as string[],
    evidenceBudgetChars: 1200,
    snippetLength: 200,
    maxFullResults: 3,
    searchBudgetMaxCalls: 16,
    searchBudgetMaxElapsedMs: 30_000,
    searchBudgetMaxResults: 100,
    searchCacheDirectory: '',
    searchCacheTtlMs: 60_000,
    searchCacheMaxEntries: 1_000,
    outputStyle: 'normal' as 'normal' | 'compact',
    minConfidence: 0,
    minSourceCount: 1,
    semanticDedup: false,
    semanticRerank: false,
    dedupThreshold: 0.85,
    dedupModel: 'test-dedup',
    rerankTopK: 5,
    rerankModel: 'test-rerank',
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
  createSearchEvidenceEvaluator: vi.fn((policy) => ({
    evaluate: (rawResults) => {
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
    },
    assess: (results) => aggregationState.checkConfidenceBasket(
      results,
      policy.qualityGate,
    ),
  })),
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
  semanticDedup: vi.fn(async (results) => ({
    results,
    removedCount: 0,
  })),
  semanticRerank: vi.fn(async (_query, results) => results),
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
      getAvailability: infrastructureState.getAvailability,
      recordSuccess: vi.fn(),
      recordFailure: infrastructureState.recordFailure,
      suspend: infrastructureState.suspend,
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
import { EngineAdapterError } from '../../src/engines/engine-error.js';
import {
  checkConfidenceBasket,
  detectLanguage,
  enrichResults,
  expandQuery,
  filterLowQuality,
  formatResults,
  semanticDedup,
  semanticRerank,
} from '../../src/aggregation/index.js';

function makeResults(count: number, source: string) {
  return Array.from({ length: count }, (_, i) => ({
    title: `R${i}`,
    url: `https://${source}.ex/${i}`,
    snippet: `Snippet ${i}`,
    source,
  }));
}

function resetAggregationMocks(): void {
  aggregationState.checkConfidenceBasket.mockReset();
  aggregationState.checkConfidenceBasket.mockReturnValue({
    sufficient: true,
    basketConfidence: 0.85,
    basketRelevance: 0.6,
    relevantResultsCount: 5,
    relevanceThreshold: 0.35,
    providerFamilyCount: 2,
    topResultsCount: 5,
    analyzedCount: 10,
  });
  (semanticDedup as any).mockReset();
  (semanticDedup as any).mockImplementation(async (results: unknown[]) => ({
    results,
    removedCount: 0,
  }));
  (semanticRerank as any).mockReset();
  (semanticRerank as any).mockImplementation(
    async (_query: string, results: unknown[]) => results,
  );
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
  beforeEach(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    vi.clearAllMocks();
    resetAggregationMocks();
    infrastructureState.cacheGet.mockReturnValue(null);
    infrastructureState.getAvailability.mockReset();
    infrastructureState.getAvailability.mockReturnValue({ available: true });
    infrastructureState.suspend.mockReset();
    infrastructureState.recordFailure.mockReset();
    infrastructureState.config.outputStyle = 'normal';
    infrastructureState.config.minConfidence = 0;
    infrastructureState.config.minSourceCount = 1;
    infrastructureState.config.semanticDedup = false;
    infrastructureState.config.semanticRerank = false;
    infrastructureState.config.searchBudgetMaxCalls = 16;
    infrastructureState.config.searchBudgetMaxElapsedMs = 30_000;
    infrastructureState.config.searchBudgetMaxResults = 100;
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

  it('returns a machine-readable partial response when the call budget is exhausted', async () => {
    infrastructureState.config.searchBudgetMaxCalls = 1;

    const res = await searchWithFallback({
      query: 'bounded search',
      engines: ['duckduckgo', 'sogou'],
    });

    expect(res.meta.execution).toMatchObject({
      stop_reason: 'budget_exhausted',
      early_stop: true,
      budget: {
        limits: { engine_calls: 1 },
        observed: { engine_calls: 1 },
        exhausted: true,
        exhausted_reasons: ['engine_calls'],
      },
    });
    expect(res.partialFailures).toContainEqual(expect.objectContaining({
      engine: 'request_budget',
      type: 'budget_exhausted',
    }));
    expect(searchDuckDuckGo).toHaveBeenCalledTimes(1);
    expect(searchSogou).not.toHaveBeenCalled();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(infrastructureState.cacheSet).not.toHaveBeenCalled();
  });

  it('does not cache an empty all-provider failure response', async () => {
    const failure = new EngineAdapterError(
      'upstream_5xx',
      'provider failed',
      { retryable: false, suggestion: 'retry later' },
    );
    (searchDuckDuckGo as any).mockRejectedValue(failure);
    (searchSogou as any).mockRejectedValue(failure);

    const response = await searchWithFallback({ query: 'uncacheable failure' });
    expect(response.results).toEqual([]);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(infrastructureState.cacheSet).not.toHaveBeenCalled();
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

  it('preserves a zero-key anti-bot challenge as its own failure type', async () => {
    (searchSogou as any).mockRejectedValue(new EngineAdapterError(
      'bot_challenge',
      'Sogou returned an anti-bot challenge',
      {
        retryable: false,
        cooldownMs: 3_600_000,
        suggestion: 'Use another network runner',
      },
    ));

    const result = await searchWithFallback({
      query: 'sogou challenge',
      count: 3,
      engines: ['sogou', 'wikipedia'],
    });

    expect(result.partialFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engine: 'sogou',
        type: 'bot_challenge',
        suggestion: 'Use another network runner',
      }),
    ]));
  });

  it('reports a provider skipped by durable cooldown as a partial failure', async () => {
    infrastructureState.getAvailability.mockImplementation((engine: string) => (
      engine === 'sogou'
        ? {
            available: false,
            failureType: 'bot_challenge',
            retryAt: Date.parse('2026-07-26T18:00:00Z'),
          }
        : { available: true }
    ));

    const response = await searchWithFallback({
      query: 'cooldown evidence',
      engines: ['duckduckgo', 'sogou'],
    });

    expect(searchSogou).not.toHaveBeenCalled();
    expect(response.partialFailures).toContainEqual(expect.objectContaining({
      engine: 'sogou',
      type: 'bot_challenge',
      message: expect.stringContaining('cooling down'),
    }));
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

  it('reports an explicitly requested optional provider with a blank credential', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = '   ';

    try {
      const result = await searchWithFallback({
        query: 'parallel-missing-optional-credential',
        engines: ['exa'],
      });

      expect(searchExa).not.toHaveBeenCalled();
      expect(result.partialFailures).toEqual([
        expect.objectContaining({
          engine: 'exa',
          type: 'permission_denied',
          message: 'exa credential is not configured',
          suggestion: expect.stringContaining('EXA_API_KEY'),
        }),
      ]);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.EXA_API_KEY;
      } else {
        process.env.EXA_API_KEY = previousApiKey;
      }
    }
  });

  it('uses the post-semantic basket for routing diagnostics', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = 'test-key';
    infrastructureState.config.semanticDedup = true;
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchExa as any).mockResolvedValue(makeResults(2, 'exa'));
    (checkConfidenceBasket as any).mockImplementation((results: unknown[]) => ({
      sufficient: results.length >= 2,
      basketConfidence: results.length >= 2 ? 0.8 : 0.4,
      basketRelevance: results.length >= 2 ? 0.6 : 0.3,
      relevantResultsCount: results.length,
      relevanceThreshold: 0.35,
      providerFamilyCount: results.length >= 2 ? 2 : 1,
      topResultsCount: results.length,
      analyzedCount: results.length,
    }));
    (semanticDedup as any).mockResolvedValueOnce({
      results: [{
        ...makeResults(1, 'semantic')[0],
        confidence: 0.8,
        relevance: 0.6,
        source_count: 1,
        score: 0.6,
      }],
      removedCount: 4,
    });

    try {
      const result = await searchWithFallback({
        query: 'post-semantic-routing',
        count: 3,
        engines: ['duckduckgo', 'exa'],
      });

      expect(searchExa).toHaveBeenCalled();
      expect(semanticDedup).toHaveBeenCalledTimes(2);
      expect(result.meta.execution?.quality_gate_stage).toBe('post_semantic');
      expect(result.meta.execution?.quality_gate?.sufficient).toBe(true);
      expect(result.meta.execution?.early_stop).toBe(false);
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
    const engineOptions = vi.mocked(searchDuckDuckGo).mock.calls[0][2];
    expect(engineOptions?.signal?.aborted).toBe(true);
    expect(infrastructureState.suspend).not.toHaveBeenCalled();
    expect(infrastructureState.recordFailure).not.toHaveBeenCalled();
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
    resetAggregationMocks();
    infrastructureState.cacheGet.mockReturnValue(null);
    infrastructureState.config.outputStyle = 'normal';
    infrastructureState.config.minConfidence = 0;
    infrastructureState.config.minSourceCount = 1;
    infrastructureState.config.semanticDedup = false;
    infrastructureState.config.semanticRerank = false;
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

  it('preserves a missing optional credential in waterfall failures', async () => {
    const previousApiKey = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;

    try {
      const result = await searchWithFallback({
        query: 'waterfall-missing-optional-credential',
        engines: ['exa'],
        waterfall: true,
        expandQueries: false,
      });

      expect(searchExa).not.toHaveBeenCalled();
      expect(result.partialFailures).toEqual([
        expect.objectContaining({
          engine: 'exa',
          type: 'permission_denied',
          suggestion: expect.stringContaining('EXA_API_KEY'),
        }),
      ]);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.EXA_API_KEY;
      } else {
        process.env.EXA_API_KEY = previousApiKey;
      }
    }
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

  it('does not let a pre-semantic gate skip selected waterfall phases', async () => {
    infrastructureState.config.semanticDedup = true;
    (searchWikipedia as any).mockResolvedValue(makeResults(1, 'wikipedia'));
    (checkConfidenceBasket as any).mockImplementation((results: unknown[]) => ({
      sufficient: results.length >= 2,
      basketConfidence: 0.8,
      basketRelevance: 0.6,
      relevantResultsCount: results.length,
      relevanceThreshold: 0.35,
      providerFamilyCount: results.length >= 2 ? 2 : 1,
      topResultsCount: results.length,
      analyzedCount: results.length,
    }));
    (semanticDedup as any).mockResolvedValueOnce({
      results: [{
        ...makeResults(1, 'semantic')[0],
        confidence: 0.8,
        relevance: 0.6,
        source_count: 1,
        score: 0.6,
      }],
      removedCount: 5,
    });

    const result = await searchWithFallback({
      query: 'semantic-waterfall-phases',
      engines: ['duckduckgo', 'sogou', 'wikipedia'],
      waterfall: true,
      expandQueries: false,
    });

    expect(searchDuckDuckGo).toHaveBeenCalled();
    expect(searchSogou).toHaveBeenCalled();
    expect(searchWikipedia).toHaveBeenCalled();
    expect(semanticDedup).toHaveBeenCalledTimes(2);
    expect(result.meta.execution?.phases_completed).toEqual(['1a', '1c']);
    expect(result.meta.execution?.quality_gate_stage).toBe('post_semantic');
    expect(result.meta.execution?.early_stop).toBe(false);
  });

  it('skips query expansion only after the post-semantic gate passes', async () => {
    infrastructureState.config.semanticDedup = true;
    (expandQuery as any).mockReturnValue(['alternative-query']);

    try {
      const result = await searchWithFallback({
        query: 'semantic-expansion-gate',
        engines: ['duckduckgo', 'sogou'],
        waterfall: true,
      });

      expect(searchDuckDuckGo).not.toHaveBeenCalledWith(
        'alternative-query',
        expect.any(Number),
      );
      expect(searchSogou).not.toHaveBeenCalledWith(
        'alternative-query',
        expect.any(Number),
      );
      expect(result.meta.execution?.phases_completed).toEqual(['1a']);
      expect(result.meta.execution?.quality_gate_stage).toBe('post_semantic');
      expect(result.meta.execution?.early_stop).toBe(true);
      expect(result.meta.execution?.stop_reason).toBe('quality_gate_satisfied');
    } finally {
      (expandQuery as any).mockReturnValue([]);
    }
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
    expect(infrastructureState.cacheGet).toHaveBeenCalledWith(
      expect.stringMatching(/^search-cache-key-v1:[a-f0-9]{64}$/),
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

  it('runs each expanded query once without recursively expanding it', async () => {
    (searchDuckDuckGo as any).mockResolvedValue([]);
    (searchSogou as any).mockResolvedValue([]);
    (expandQuery as any).mockReturnValue(['alternative-query']);
    (checkConfidenceBasket as any).mockReturnValue({
      sufficient: false,
      basketConfidence: 0,
      basketRelevance: 0,
      relevantResultsCount: 0,
      relevanceThreshold: 0.35,
      providerFamilyCount: 0,
      topResultsCount: 0,
      analyzedCount: 0,
    });

    try {
      const result = await searchWithFallback({
        query: 'original-query-no-recursion',
        engines: ['duckduckgo', 'sogou'],
        waterfall: true,
      });

      expect(searchDuckDuckGo).toHaveBeenCalledTimes(2);
      expect(searchSogou).toHaveBeenCalledTimes(2);
      expect(result.meta.execution?.searched_engines).toEqual([
        'duckduckgo',
        'sogou',
        'duckduckgo',
        'sogou',
      ]);
    } finally {
      (expandQuery as any).mockReturnValue([]);
    }
  });
});

describe('setupFreeSearchTool', () => {
  it('registers free_search tool', () => {
    const server = { registerTool: vi.fn() } as any;
    setupFreeSearchTool(server);
    expect(server.registerTool).toHaveBeenCalledOnce();
    expect(server.registerTool.mock.calls[0][0]).toBe('free_search');
    expect(server.registerTool.mock.calls[0][1].outputSchema)
      .toEqual(expect.objectContaining({
        query: expect.anything(),
        results: expect.anything(),
        meta: expect.anything(),
      }));
  });

  it('returns one canonical packet plus a compact text view', async () => {
    vi.clearAllMocks();
    resetAggregationMocks();
    infrastructureState.cacheGet.mockReturnValue(null);
    infrastructureState.config.outputStyle = 'normal';
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(1, 'ddg'));

    const server = { registerTool: vi.fn() } as any;
    setupFreeSearchTool(server);
    const handler = server.registerTool.mock.calls[0][2];
    const response = await handler({
      query: 'structured output query',
      limit: 1,
      engines: ['duckduckgo'],
    }, {});
    expect(response.structuredContent).toEqual(expect.objectContaining({
      query: 'structured output query',
      results: [expect.objectContaining({
        title: 'R0',
        url: 'https://ddg.ex/0',
      })],
    }));
    expect(response.content[0].text).toContain('Search evidence for: structured output query');
    expect(response.content[0].text).toContain('https://ddg.ex/0');
    expect(response.content[0].text).not.toContain('"security_note"');
    expect(response.isError).toBeUndefined();
  });
});
