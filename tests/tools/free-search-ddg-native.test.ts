import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock all engines
vi.mock('../../src/engines/duckduckgo.js', () => ({
  searchDuckDuckGo: vi.fn(async () => [
    {
      title: 'DuckDuckGo HTML Result',
      url: 'https://duckduckgo.example/1',
      snippet: 'HTML fallback result',
      source: 'duckduckgo',
    },
  ]),
  duckduckgoProvider: { id: 'duckduckgo', name: 'DuckDuckGo', isFree: true, languages: ['en'] },
}));
vi.mock('../../src/engines/sogou.js', () => ({
  searchSogou: vi.fn(async () => [
    { title: 'Sogou Result', url: 'https://sogou.ex/1', snippet: 'snippet', source: 'sogou' },
  ]),
}));
vi.mock('../../src/engines/bing.js', () => ({ searchBing: vi.fn(async () => []) }));
vi.mock('../../src/engines/baidu.js', () => ({ searchBaidu: vi.fn(async () => []) }));
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
  dedupByUrl: vi.fn((r) => ({ results: r, frequencies: new Map() })),
  dedupByTitle: vi.fn((r) => r),
  filterLowQuality: vi.fn((r) => r),
  getProviderFamily: vi.fn((engine: string) => (
    engine === 'duckduckgo' || engine === 'bing' ? 'bing' : engine
  )),
  scoreAndRank: vi.fn((r) => r.map((x) => ({ ...x, confidence: 1, relevance: 0.5, source_count: 1, score: 0.5 }))),
  createSearchEvidenceEvaluator: vi.fn(() => ({
    evaluate: (rawResults) => {
      const results = rawResults.map((item) => ({
        ...item,
        confidence: 1,
        relevance: 0.5,
        source_count: 1,
        score: 0.5,
      }));
      return {
        results,
        qualityGate: {
          sufficient: true,
          basketConfidence: 1,
          basketRelevance: 0.5,
          relevantResultsCount: results.length,
          relevanceThreshold: 0.35,
          providerFamilyCount: 1,
          topResultsCount: results.length,
          analyzedCount: results.length,
        },
      };
    },
    assess: (results) => ({
      sufficient: true,
      basketConfidence: 1,
      basketRelevance: 0.5,
      relevantResultsCount: results.length,
      relevanceThreshold: 0.35,
      providerFamilyCount: 1,
      topResultsCount: results.length,
      analyzedCount: results.length,
    }),
  })),
  formatResults: vi.fn((r) => ({
    results: r,
    meta: { total: r.length, high_confidence: r.length, engines: [] },
    security_note: '',
  })),
  checkConfidenceBasket: vi.fn(() => ({
    sufficient: true,
    basketConfidence: 0.8,
    basketRelevance: 0.5,
    relevantResultsCount: 1,
    relevanceThreshold: 0.35,
    providerFamilyCount: 1,
    topResultsCount: 1,
    analyzedCount: 1,
  })),
  enrichResults: vi.fn(async (r) => ({ results: r, enriched: 0, failures: 0 })),
  expandQuery: vi.fn(() => []),
  hasChinese: vi.fn(() => false),
  generateChineseVariants: vi.fn(() => []),
  detectLanguage: vi.fn(() => 'en'),
  semanticDedup: vi.fn(async (results) => ({ results, removedCount: 0 })),
  semanticRerank: vi.fn(async (_query, results) => results),
}));

vi.mock('../../src/infrastructure/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    SearchCache: vi.fn(() => ({
      get: vi.fn(() => null),
      set: vi.fn(),
      makeKey: vi.fn((q, c, e) => `${q}:${c}:${[...e].sort().join(',')}`),
    })),
    RateLimiter: vi.fn(() => ({
      waitForSlot: vi.fn(async () => {}),
      getAllRateLimits: vi.fn(() => ({})),
    })),
    HealthTracker: vi.fn(() => ({
      isHealthy: vi.fn(() => true),
      getAvailability: vi.fn(() => ({ available: true })),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    })),
    EnginePolicy: vi.fn(() => ({ isAllowed: vi.fn(() => true) })),
    loadConfig: vi.fn(() => ({
      ALLOWED_ENGINES: [],
      DENIED_ENGINES: [],
      searchBudgetMaxCalls: 16,
      searchBudgetMaxElapsedMs: 30_000,
      searchBudgetMaxResults: 100,
      evidenceBudgetChars: 1200,
      snippetLength: 200,
      maxFullResults: 3,
      searchCacheDirectory: '',
      searchCacheTtlMs: 60_000,
      searchCacheMaxEntries: 1_000,
    })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import { searchDuckDuckGo } from '../../src/engines/duckduckgo.js';
import { searchWithFallback } from '../../src/tools/free-search.js';

describe('native Node DDG adapter', () => {
  it('returns DDG results without an external runtime', async () => {
    const response = await searchWithFallback({
      query: 'test query',
      count: 5,
      engines: ['duckduckgo', 'sogou'],
    });

    expect(searchDuckDuckGo).toHaveBeenCalledWith(
      'test query',
      5,
      expect.objectContaining({ throwOnError: true }),
    );
    const ddgFailure = response.partialFailures?.find(
      (f) => f.engine === 'duckduckgo'
    );
    expect(ddgFailure).toBeUndefined();
    expect(response.results.some((result) => result.title === 'DuckDuckGo HTML Result')).toBe(true);
  });

  it('uses correct engine name in failures (not "unknown")', async () => {
    const response = await searchWithFallback({
      query: 'test query',
      count: 5,
      engines: ['duckduckgo', 'sogou'],
    });

    if (response.partialFailures) {
      for (const f of response.partialFailures) {
        expect(f.engine).not.toBe('unknown');
      }
    }
  });
});
