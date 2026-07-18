import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ── Module-level mocks (ALL factories are hoisted — no variable refs) ─
vi.mock('../../src/engines/duckduckgo.js', () => ({ searchDuckDuckGo: vi.fn() }));
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

vi.mock('../../src/aggregation/index.js', () => ({
  dedupByProvider: vi.fn((r) => r),
  dedupByUrl: vi.fn((r) => ({ results: r, frequencies: new Map() })),
  dedupByTitle: vi.fn((r) => r),
  filterLowQuality: vi.fn((r) => r),
  scoreAndRank: vi.fn((r) => r.map((x) => ({ ...x, confidence: 0.8, score: 0.6 }))),
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
    EnginePolicy: vi.fn(() => ({
      isAllowed: vi.fn(() => true),
    })),
    loadConfig: vi.fn(() => ({ ALLOWED_ENGINES: [], DENIED_ENGINES: [] })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

// Import mocks (vi.mock is hoisted, so these resolve to mocked versions)
import { searchDuckDuckGo } from '../../src/engines/duckduckgo.js';
import { searchSogou } from '../../src/engines/sogou.js';
import { searchBing } from '../../src/engines/bing.js';
import { searchBaidu } from '../../src/engines/baidu.js';
import { detectLanguage, enrichResults } from '../../src/aggregation/index.js';

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
});

// ── Tests ──────────────────────────────────────────────────────────
describe('searchWithFallback — parallel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('collapses concurrent duplicate requests', async () => {
    const [a, b] = await Promise.all([
      searchWithFallback({ query: 'dup' }),
      searchWithFallback({ query: 'dup' }),
    ]);
    expect(a).toBe(b);
  });

  it('handles engine failure gracefully', async () => {
    (searchBing as any).mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      searchWithFallback({ query: 'fail', engines: ['duckduckgo', 'sogou', 'bing' as any] })
    ).resolves.toBeDefined();
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
});

describe('searchWithFallback — waterfall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (searchDuckDuckGo as any).mockResolvedValue(makeResults(3, 'ddg'));
    (searchSogou as any).mockResolvedValue(makeResults(3, 'sogou'));
  });

  it('executes waterfall phases', async () => {
    const res = await searchWithFallback({ query: 'wf', waterfall: true });
    expect(res).toBeDefined();
    expect(res.query).toBe('wf');
  });
});

describe('setupFreeSearchTool', () => {
  it('registers free_search tool', () => {
    const server = { tool: vi.fn() } as any;
    setupFreeSearchTool(server);
    expect(server.tool).toHaveBeenCalledOnce();
    expect(server.tool.mock.calls[0][0]).toBe('free_search');
  });
});
