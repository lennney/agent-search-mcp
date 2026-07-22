import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock all engines
vi.mock('../../src/engines/duckduckgo.js', () => ({
  searchDuckDuckGo: vi.fn(),
  isDdgsAvailable: vi.fn(() => false),
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

vi.mock('../../src/aggregation/index.js', () => ({
  dedupByUrl: vi.fn((r) => ({ results: r, frequencies: new Map() })),
  dedupByTitle: vi.fn((r) => r),
  filterLowQuality: vi.fn((r) => r),
  scoreAndRank: vi.fn((r) => r.map((x) => ({ ...x, confidence: 1, score: 0.5 }))),
  formatResults: vi.fn((r) => ({
    results: r,
    meta: { total: r.length, high_confidence: r.length, engines: [] },
    security_note: '',
  })),
  checkConfidenceBasket: vi.fn(() => ({ sufficient: true, basketConfidence: 0.8, topResultsCount: 1, analyzedCount: 1 })),
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
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    })),
    EnginePolicy: vi.fn(() => ({ isAllowed: vi.fn(() => true) })),
    loadConfig: vi.fn(() => ({ ALLOWED_ENGINES: [], DENIED_ENGINES: [] })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import { searchWithFallback } from '../../src/tools/free-search.js';

describe('DDG unavailable partialFailures', () => {
  it('includes DDG unavailability in partialFailures', async () => {
    const response = await searchWithFallback({
      query: 'test query',
      count: 5,
      engines: ['duckduckgo', 'sogou'],
    });

    expect(response.partialFailures).toBeDefined();
    expect(response.partialFailures!.length).toBeGreaterThan(0);
    const ddgFailure = response.partialFailures!.find(
      (f) => f.engine === 'duckduckgo'
    );
    expect(ddgFailure).toBeDefined();
    expect(ddgFailure!.message).toContain('ddgs');
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
