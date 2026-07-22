# DDGS Independence — Eliminate Python Hard Dependency

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agent-search-mcp work out-of-the-box without Python/ddgs installed — `npm install` is enough. DuckDuckGo engine gracefully degrades when Python is absent, and a native Node.js HTML fallback eliminates the hard dependency entirely.

**Architecture:** Two phases. Phase 1: lazy Python detection with cached result, health reporting, and partialFailures injection — users without Python see clear warnings instead of silent empty results. Phase 2: a Node.js-native DDG HTML engine (cheerio-based) serves as automatic fallback when Python/ddgs is unavailable, removing the hard dependency while keeping the Python path as preferred (more stable, uses DDG's internal API).

**Tech Stack:** TypeScript (ESM, strict), Node.js >=18, vitest, cheerio (new in Phase 2), pino logger, @modelcontextprotocol/sdk

## Global Constraints

- **TypeScript strict mode** — no `any` without explicit annotation, all function params/returns typed
- **ESM modules** — `.js` extensions in imports, `import.meta.url` for paths
- **Engine pattern** — each engine exports `searchXxx()` returning `Promise<SearchResult[]>` and a `xxxProvider` metadata object
- **Test pattern** — vitest, mock `global.fetch` for HTTP engines, test in `tests/engines/` directory
- **No breaking API changes** — existing tool signatures and response shapes stay backward-compatible
- **Backward compat** — `searchDuckDuckGo()` and `searchDuckduckgoNews()` keep their existing signatures
- **File naming** — snake_case for files, PascalCase for types/classes

---

## File Structure

### Phase 1 — Graceful Degradation

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/engines/duckduckgo.ts` | Lazy Python detection (cached), export `isDdgsAvailable()`, switch console.error → logger |
| Modify | `src/infrastructure/health.ts` | Add optional `ddgs_available?: boolean` field to `ProviderHealth` interface |
| Modify | `src/tools/health.ts` | Augment DDG provider health with `ddgs_available` + `python_path` |
| Modify | `src/tools/free-search.ts` | Throw on unavailable DDG so partialFailures records it; fix engine name in failure entries |
| Create | `tests/engines/duckduckgo.test.ts` | Test lazy detection, `isDdgsAvailable()`, cached behavior |
| Modify | `README.md` | Windows install note: ddgs optional |
| Modify | `README-zh.md` | Same, Chinese |
| Modify | `AGENTS.md` | Update "已知陷阱": ddgs is optional |

### Phase 2 — Native Node.js DDG Engine

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Add `cheerio` dependency |
| Create | `src/engines/duckduckgo-html.ts` | Node.js-native DDG engine via cheerio HTML parsing |
| Create | `tests/engines/duckduckgo-html.test.ts` | Test HTML parsing, fetch mock, error handling |
| Modify | `src/engines/duckduckgo.ts` | Python path first → HTML fallback when ddgs unavailable |
| Modify | `Dockerfile` | Remove python3 + pip + ddgs install |
| Modify | `README.md` | Remove `pip install ddgs` requirement |
| Modify | `README-zh.md` | Same, Chinese |
| Modify | `AGENTS.md` | Update "已知陷阱": ddgs optional, HTML fallback exists |

---

## Phase 1: Graceful Degradation

### Task 1: Lazy Python Detection + `isDdgsAvailable()`

**Files:**
- Modify: `src/engines/duckduckgo.ts` (full rewrite of detection logic + search functions)
- Test: `tests/engines/duckduckgo.test.ts`

**Interfaces:**
- Consumes: `SearchResult` from `src/types.ts`, `logger` from `src/infrastructure/logger.js`
- Produces: `isDdgsAvailable(): boolean` — exported, used by health tool and free-search

- [ ] **Step 1: Write the failing test**

Create `tests/engines/duckduckgo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execFileSync so we don't actually call Python
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

import { execFileSync } from 'child_process';
import { isDdgsAvailable, duckduckgoProvider } from '../../src/engines/duckduckgo.js';

describe('DuckDuckGo engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('has correct provider metadata', () => {
    expect(duckduckgoProvider.id).toBe('duckduckgo');
    expect(duckduckgoProvider.name).toBe('DuckDuckGo');
    expect(duckduckgoProvider.isFree).toBe(true);
  });

  it('isDdgsAvailable returns true when ddgs is installed', async () => {
    vi.mocked(execFileSync).mockReturnValue('5.0.0\n');
    // Re-import to reset lazy cache
    const mod = await import('../../src/engines/duckduckgo.js');
    expect(mod.isDdgsAvailable()).toBe(true);
  });

  it('isDdgsAvailable returns false when ddgs is not installed', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });
    const mod = await import('../../src/engines/duckduckgo.js');
    expect(mod.isDdgsAvailable()).toBe(false);
  });

  it('caches the ddgs availability check (only calls execFileSync once per import)', async () => {
    vi.mocked(execFileSync).mockReturnValue('5.0.0\n');
    const mod = await import('../../src/engines/duckduckgo.js');
    mod.isDdgsAvailable();
    mod.isDdgsAvailable();
    mod.isDdgsAvailable();
    // Should only call execFileSync once per candidate at most
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engines/duckduckgo.test.ts`
Expected: FAIL — `isDdgsAvailable` is not exported from duckduckgo.ts

- [ ] **Step 3: Write minimal implementation**

Replace the contents of `src/engines/duckduckgo.ts` with:

```typescript
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { SearchResult } from '../types.js';
import { logger } from '../infrastructure/logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-search.py');
const NEWS_SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-news-search.py');

// Python paths to check for ddgs availability, ordered by reliability.
const PYTHON_CANDIDATES = (() => {
  const home = process.env.HOME || '';
  const pipxDir = `${home}/.local/pipx/venvs/ddgs`;
  const pipxPython = existsSync(pipxDir) ? `${pipxDir}/bin/python3` : null;
  return [
    ...(pipxPython ? [pipxPython] : []),
    'python3',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/opt/homebrew/opt/python@3.14/bin/python3.14',
  ];
})();

export const duckduckgoProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo',
  isFree: true,
  languages: ['en'],
};

// ─── Lazy Python detection (cached) ──────────────────────────────────────

let _pythonBin: string | null = null;
let _ddgsChecked = false;

/**
 * Probe Python candidates for ddgs availability. Called at most once;
 * result is cached in _pythonBin.
 */
function detectPythonBin(): string | null {
  const testScript = 'import ddgs; print(ddgs.__version__)';
  for (const p of PYTHON_CANDIDATES) {
    try {
      const out = execFileSync(p, ['-c', testScript], {
        timeout: 3000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      logger.info({ python: p, version: out.trim() }, 'DDG: Using Python backend');
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Get the cached Python binary path (or null if ddgs not available).
 * Detection runs only once per process lifetime.
 */
function getPythonBin(): string | null {
  if (_ddgsChecked) return _pythonBin;
  _ddgsChecked = true;
  _pythonBin = detectPythonBin();
  if (!_pythonBin) {
    logger.warn('DDG: Python/ddgs not available — DuckDuckGo engine will return empty results');
  }
  return _pythonBin;
}

/**
 * Check whether the ddgs Python library is available.
 * Triggers lazy detection on first call; subsequent calls use cached result.
 */
export function isDdgsAvailable(): boolean {
  return getPythonBin() !== null;
}

/**
 * Get the Python binary path for internal use. Returns null if unavailable.
 */
function getPythonBinOrNull(): string | null {
  return getPythonBin();
}

// ─── Search functions ────────────────────────────────────────────────────

/**
 * Search DuckDuckGo using ddgs Python library (bypasses anti-bot).
 * Returns empty array if Python/ddgs not available.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    return [];
  }
  try {
    const output = execFileSync(
      pythonBin,
      [SCRIPT_PATH, query, String(limit)],
      {
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const results = JSON.parse(output.trim());
    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source || 'duckduckgo',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOENT')) {
      logger.warn({ python: pythonBin, script: SCRIPT_PATH }, 'DDG: Python binary not found');
    } else if (msg.includes('timeout')) {
      logger.warn('DDG: Search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG search failed');
    }
    return [];
  }
}

/**
 * Search DuckDuckGo News using ddgs Python library.
 * Returns empty array if Python/ddgs not available.
 */
export async function searchDuckduckgoNews(query: string, limit: number = 10, timeRange: string = 'w'): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    return [];
  }
  const timeMap: Record<string, string> = { day: 'd', week: 'w', month: 'm' };
  const timelimit = timeMap[timeRange] || 'w';

  try {
    const output = execFileSync(
      pythonBin,
      [NEWS_SCRIPT_PATH, query, String(limit), timelimit],
      {
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const entries = JSON.parse(output.trim());
    return entries.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source_name || 'duckduckgo-news',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ err: msg.slice(0, 200) }, 'DDG News search failed');
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engines/duckduckgo.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/engines/duckduckgo.ts tests/engines/duckduckgo.test.ts
git commit -m "feat: lazy Python detection + isDdgsAvailable() for DDG engine"
```

---

### Task 2: Health Reporting with ddgs Availability

**Files:**
- Modify: `src/tools/health.ts` (augment DDG provider health with ddgs info)
- Test: `tests/tools/health.test.ts`

**Interfaces:**
- Consumes: `isDdgsAvailable` from `src/engines/duckduckgo.js`, `HealthTracker.getHealth()` from `src/infrastructure/health.js`
- Produces: Health resource output includes `ddgs_available` and `python_path` for the duckduckgo provider

- [ ] **Step 1: Write the failing test**

Create `tests/tools/health.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/engines/duckduckgo.js', () => ({
  isDdgsAvailable: vi.fn(() => true),
  duckduckgoProvider: { id: 'duckduckgo', name: 'DuckDuckGo', isFree: true, languages: ['en'] },
  searchDuckDuckGo: vi.fn(),
  searchDuckduckgoNews: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    resource(_name: string, _uri: string, handler: any) {
      (this as any)._handler = handler;
    }
    async callResource() {
      return (this as any)._handler();
    }
  },
}));

import { registerHealth } from '../../src/tools/health.js';
import { HealthTracker } from '../../src/infrastructure/health.js';
import { isDdgsAvailable } from '../../src/engines/duckduckgo.js';

describe('Health tool with ddgs availability', () => {
  it('includes ddgs_available in DDG provider health', async () => {
    const ht = new HealthTracker();
    ht.recordSuccess('duckduckgo', 100);

    const mockServer: any = {
      resource: vi.fn(),
    };

    registerHealth(mockServer, ht);

    // The handler was registered — call it
    const handler = mockServer.resource.mock.calls[0][2];
    const result = await handler();

    const text = result.contents[0].text;
    const parsed = JSON.parse(text);
    const ddgHealth = parsed.find((h: any) => h.provider === 'duckduckgo');

    expect(ddgHealth).toBeDefined();
    expect(ddgHealth.ddgs_available).toBe(true);
  });

  it('shows ddgs_available=false when ddgs is not installed', async () => {
    vi.mocked(isDdgsAvailable).mockReturnValue(false);

    const ht = new HealthTracker();
    ht.recordSuccess('duckduckgo', 100);

    const mockServer: any = {
      resource: vi.fn(),
    };

    registerHealth(mockServer, ht);

    const handler = mockServer.resource.mock.calls[0][2];
    const result = await handler();

    const parsed = JSON.parse(result.contents[0].text);
    const ddgHealth = parsed.find((h: any) => h.provider === 'duckduckgo');

    expect(ddgHealth.ddgs_available).toBe(false);
  });

  it('does not add ddgs fields to non-DDG providers', async () => {
    const ht = new HealthTracker();
    ht.recordSuccess('sogou', 100);

    const mockServer: any = {
      resource: vi.fn(),
    };

    registerHealth(mockServer, ht);

    const handler = mockServer.resource.mock.calls[0][2];
    const result = await handler();

    const parsed = JSON.parse(result.contents[0].text);
    const sogouHealth = parsed.find((h: any) => h.provider === 'sogou');

    expect(sogouHealth).toBeDefined();
    expect(sogouHealth.ddgs_available).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/health.test.ts`
Expected: FAIL — `ddgs_available` not present in health output

- [ ] **Step 3: Write minimal implementation**

**Change 1:** Add optional field to `ProviderHealth` interface in `src/infrastructure/health.ts`. Add this line to the interface (after the `circuitCooldownMs` field):

```typescript
export interface ProviderHealth {
  provider: string;
  lastSuccess: number | null;
  lastError: number | null;
  errorCount: number;
  avgLatency: number;
  isHealthy: boolean;
  // Circuit breaker state
  circuitState: 'closed' | 'open' | 'half-open';
  circuitOpenedAt: number | null;
  circuitCooldownMs: number;
  // DDG-specific: whether the ddgs Python library is available
  ddgs_available?: boolean;
}
```

**Change 2:** Replace `src/tools/health.ts` with:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HealthTracker, ServerMetrics, ProviderHealth } from '../infrastructure/health.js';
import { isDdgsAvailable } from '../engines/duckduckgo.js';

/**
 * Augment the DDG provider's health entry with ddgs availability info.
 */
function augmentDdgHealth(health: ProviderHealth[]): ProviderHealth[] {
  return health.map((h) => {
    if (h.provider === 'duckduckgo') {
      return {
        ...h,
        ddgs_available: isDdgsAvailable(),
      };
    }
    return h;
  });
}

export function registerHealth(server: McpServer, health: HealthTracker) {
  server.resource('health', 'search://health', async () => ({
    contents: [{
      uri: 'search://health',
      mimeType: 'application/json',
      text: JSON.stringify(augmentDdgHealth(health.getHealth()), null, 2),
    }]
  }));
}

export function registerHealthMetrics(server: McpServer, metrics: ServerMetrics) {
  server.resource('health-metrics', 'mcp://health/metrics', async () => ({
    contents: [{
      uri: 'mcp://health/metrics',
      mimeType: 'application/json',
      text: JSON.stringify(metrics.getMetrics(), null, 2),
    }]
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/health.test.ts`
Expected: PASS — all 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/health.ts tests/tools/health.test.ts
git commit -m "feat: add ddgs_available to DDG provider health report"
```

---

### Task 3: partialFailures for Unavailable DDG

**Files:**
- Modify: `src/tools/free-search.ts` (lines 98-101 DDG case + lines 379-388 failure recording)
- Test: `tests/tools/free-search-ddg-unavailable.test.ts`

**Interfaces:**
- Consumes: `isDdgsAvailable` from `src/engines/duckduckgo.js`
- Produces: `partialFailures` array in SearchResponse includes DDG unavailability message

- [ ] **Step 1: Write the failing test**

Create `tests/tools/free-search-ddg-unavailable.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/free-search-ddg-unavailable.test.ts`
Expected: FAIL — `partialFailures` is undefined (DDG returns `[]` silently, no failure recorded)

- [ ] **Step 3: Write minimal implementation**

In `src/tools/free-search.ts`, make two changes:

**Change 1:** Add `isDdgsAvailable` to the import from duckduckgo.js (line 3):

```typescript
import { searchDuckDuckGo, isDdgsAvailable } from '../engines/duckduckgo.js';
```

**Change 1a:** Update the existing test `tests/tools/free-search.test.ts` mock to include `isDdgsAvailable`. Replace line 4:

```typescript
vi.mock('../../src/engines/duckduckgo.js', () => ({ searchDuckDuckGo: vi.fn() }));
```

with:

```typescript
vi.mock('../../src/engines/duckduckgo.js', () => ({
  searchDuckDuckGo: vi.fn(),
  isDdgsAvailable: vi.fn(() => true),
}));
```

**Change 2:** In the `searchEngine` function, add a DDG availability check before the retry loop. Insert after the `rateLimiter.waitForSlot(engine)` call (after line 91), before `let lastError`:

```typescript
  // Rate limit before making the request
  await rateLimiter.waitForSlot(engine);

  // DDG-specific: throw early if ddgs is not available, so Promise.allSettled
  // records it as a rejection → partialFailures gets the correct engine name
  if (engine === 'duckduckgo' && !isDdgsAvailable()) {
    throw new Error('DuckDuckGo unavailable: Python ddgs library not installed. Install with: pip install ddgs');
  }

  let lastError: Error | null = null;
```

**Change 3:** Fix the engine name in failure entries. In `executeParallelSearch`, replace the `for (const result of batchResults)` loop (lines 379-388):

```typescript
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      if (result.status === 'fulfilled') {
        allResults.push(...result.value.results);
      } else {
        failures.push({
          engine: batch[i],
          message: result.reason?.message || 'Unknown error',
        });
      }
    }
```

**Change 4:** Apply the same fix in the Phase 2 paid engines section (lines 417-426). Replace:

```typescript
      for (const result of phase2Results) {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value.results);
        } else {
          failures.push({
            engine: 'unknown',
            message: result.reason?.message || 'Unknown error',
          });
        }
      }
```

with:

```typescript
      for (let i = 0; i < phase2Results.length; i++) {
        const result = phase2Results[i];
        if (result.status === 'fulfilled') {
          allResults.push(...result.value.results);
        } else {
          failures.push({
            engine: paidToSearch[i],
            message: result.reason?.message || 'Unknown error',
          });
        }
      }
```

**Change 5:** Apply the same fix in `executeWaterfallSearch`'s `searchBatch` function (lines 552-558). Replace:

```typescript
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value.results);
        } else {
          allFailures.push({ engine: "unknown", message: result.reason?.message || "Unknown error" });
        }
      }
```

with:

```typescript
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (result.status === "fulfilled") {
          allResults.push(...result.value.results);
        } else {
          allFailures.push({ engine: batch[i], message: result.reason?.message || "Unknown error" });
        }
      }
```

**Change 6:** Apply the same fix in `executeWaterfallSearch`'s Phase 2 paid engines section (lines 618-624). Replace:

```typescript
      for (const result of paidResults) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value.results);
        } else {
          allFailures.push({ engine: "unknown", message: result.reason?.message || "Unknown error" });
        }
      }
```

with:

```typescript
      for (let i = 0; i < paidResults.length; i++) {
        const result = paidResults[i];
        if (result.status === "fulfilled") {
          allResults.push(...result.value.results);
        } else {
          allFailures.push({ engine: paidAvailable[i], message: result.reason?.message || "Unknown error" });
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/free-search-ddg-unavailable.test.ts`
Expected: PASS — both tests pass

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass (existing tests that mock `searchDuckDuckGo` should still work since the mock bypasses the real function)

- [ ] **Step 6: Commit**

```bash
git add src/tools/free-search.ts tests/tools/free-search-ddg-unavailable.test.ts
git commit -m "feat: inject partialFailures when DDG unavailable + fix engine name in failures"
```

---

### Task 4: Phase 1 Documentation Updates

**Files:**
- Modify: `README.md` (lines 143-149, 474-479)
- Modify: `README-zh.md` (lines ~134-138, ~396-400)
- Modify: `AGENTS.md` (known traps section, line 127)

**Interfaces:**
- No code interfaces — documentation only

- [ ] **Step 1: Update README.md Prerequisites section**

In `README.md`, replace lines 143-149:

```markdown
### Prerequisites

- Node.js >= 18
- Python 3 with `ddgs` library:
```bash
pip install ddgs
```
```

with:

```markdown
### Prerequisites

- Node.js >= 18
- **Optional:** Python 3 with `ddgs` library for enhanced DuckDuckGo results:
```bash
pip install ddgs
```
> Without this, DuckDuckGo falls back to a Node.js HTML engine automatically. Other engines (Sogou, Bing, Baidu) work without any extra dependencies.
```

- [ ] **Step 2: Update README.md Dependencies section**

In `README.md`, replace lines 474-479:

```markdown
| ddgs (Python) | MIT | DuckDuckGo search backend (bypasses anti-bot) |

**Note:** `ddgs` is a Python library called via subprocess. It must be installed separately:
```bash
pip install ddgs
```
```

with:

```markdown
| ddgs (Python) | MIT | DuckDuckGo search backend (bypasses anti-bot) — **optional** |

**Note:** `ddgs` is an optional Python library. If not installed, DuckDuckGo falls back to a Node.js HTML engine. Install for best results:
```bash
pip install ddgs
```
```

- [ ] **Step 3: Update README-zh.md**

Apply equivalent changes to `README-zh.md`. Replace the Prerequisites section (around lines 134-138):

```markdown
### 前置条件

- Node.js >= 18
- Python 3 + `ddgs` 库：

```bash
pip install ddgs
```
```

with:

```markdown
### 前置条件

- Node.js >= 18
- **可选：** Python 3 + `ddgs` 库（增强 DuckDuckGo 结果质量）：

```bash
pip install ddgs
```
> 不安装也能用——DuckDuckGo 会自动回退到 Node.js HTML 引擎。其他引擎（搜狗、Bing、百度）无需额外依赖。
```

Replace the Dependencies section (around lines 396-400) similarly.

- [ ] **Step 4: Update AGENTS.md known traps**

In `AGENTS.md`, replace line 127:

```markdown
- **ddgs 依赖**: Python 库 `ddgs` 必须 pip 安装，构建时不会自动装
```

with:

```markdown
- **ddgs 依赖**: Python 库 `ddgs` 为可选依赖。未安装时 DDG 引擎自动回退到 Node.js HTML 引擎。通过 `isDdgsAvailable()` 检测可用性，结果缓存在进程生命周期内
```

- [ ] **Step 5: Commit**

```bash
git add README.md README-zh.md AGENTS.md
git commit -m "docs: mark ddgs as optional dependency in README and AGENTS.md"
```

---

## Phase 2: Native Node.js DDG Engine

### Task 5: Install cheerio + Create duckduckgo-html.ts

**Files:**
- Modify: `package.json` (add cheerio dependency)
- Create: `src/engines/duckduckgo-html.ts`
- Test: `tests/engines/duckduckgo-html.test.ts`

**Interfaces:**
- Consumes: `SearchResult` from `src/types.ts`, `cheerio` from npm
- Produces: `searchDuckDuckGoHtml(query: string, limit?: number): Promise<SearchResult[]>` — used by duckduckgo.ts as fallback

- [ ] **Step 1: Install cheerio**

Run: `npm install cheerio`
Expected: cheerio added to dependencies in package.json

- [ ] **Step 2: Write the failing test**

Create `tests/engines/duckduckgo-html.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchDuckDuckGoHtml, duckduckgoHtmlProvider } from '../../src/engines/duckduckgo-html.js';

describe('DuckDuckGo HTML engine', () => {
  it('has correct provider metadata', () => {
    expect(duckduckgoHtmlProvider.id).toBe('duckduckgo');
    expect(duckduckgoHtmlProvider.name).toBe('DuckDuckGo (HTML)');
    expect(duckduckgoHtmlProvider.isFree).toBe(true);
  });

  it('parses standard DDG HTML results', async () => {
    const html = `
      <div class="result results_links results_links_deep highlight_d">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/page1">Example Title 1</a>
        </h2>
        <a class="result__snippet" href="https://example.com/page1">Example snippet one</a>
        <span class="result__url">example.com</span>
      </div>
      <div class="result results_links results_links_deep">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/page2">Example Title 2</a>
        </h2>
        <a class="result__snippet" href="https://example.com/page2">Example snippet two</a>
        <span class="result__url">example.com</span>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Example Title 1');
      expect(results[0].url).toBe('https://example.com/page1');
      expect(results[0].snippet).toBe('Example snippet one');
      expect(results[0].source).toBe('duckduckgo');
      expect(results[0].engines).toEqual(['duckduckgo']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('respects the limit parameter', async () => {
    const html = Array.from({ length: 5 }, (_, i) => `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/${i}">Title ${i}</a>
        </h2>
        <a class="result__snippet" href="https://example.com/${i}">Snippet ${i}</a>
      </div>
    `).join('');

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 3);
      expect(results).toHaveLength(3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array when no results found', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => '<html><body>No results here</body></html>',
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on network error', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      throw new Error('Network error');
    }) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('strips HTML tags from titles and snippets', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com"><b>Bold</b> <i>Title</i></a>
        </h2>
        <a class="result__snippet" href="https://example.com">Snippet with <strong>tags</strong></a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Bold Title');
      expect(results[0].snippet).toBe('Snippet with tags');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('skips results without title or url', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="">Title without URL</a>
        </h2>
        <a class="result__snippet" href="">Snippet</a>
      </div>
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/has-url">Has URL</a>
        </h2>
        <a class="result__snippet" href="https://example.com/has-url">Valid snippet</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Has URL');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles DDG redirect URLs (uddg= parameter)', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Freal&rut=abc">Title</a>
        </h2>
        <a class="result__snippet" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Freal">Snippet</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/real');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/engines/duckduckgo-html.test.ts`
Expected: FAIL — module `../../src/engines/duckduckgo-html.js` not found

- [ ] **Step 4: Write minimal implementation**

Create `src/engines/duckduckgo-html.ts`:

```typescript
import * as cheerio from 'cheerio';
import { SearchResult } from '../types.js';
import { logger } from '../infrastructure/logger.js';

export const duckduckgoHtmlProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo (HTML)',
  isFree: true,
  languages: ['en'],
};

/**
 * Extract the real URL from a DuckDuckGo redirect link.
 * DDG wraps result URLs in /l/?uddg=<encoded_url> format.
 */
function extractRealUrl(href: string): string {
  // Check for DDG redirect pattern
  try {
    const url = new URL(href);
    if (url.pathname === '/l/' && url.searchParams.has('uddg')) {
      return url.searchParams.get('uddg') || href;
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return href;
}

/**
 * Search DuckDuckGo using direct HTML parsing (no Python dependency).
 * Fetches https://html.duckduckgo.com/html/?q=<query> and parses results with cheerio.
 */
export async function searchDuckDuckGoHtml(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'DDG HTML: HTTP error');
      return [];
    }

    const html = await res.text();
    return parseDdgHtml(html, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout')) {
      logger.warn('DDG HTML: Search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG HTML search failed');
    }
    return [];
  }
}

/**
 * Parse DuckDuckGo HTML results using cheerio.
 */
function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return false;

    const $el = $(el);
    const titleLink = $el.find('.result__a').first();
    const rawUrl = titleLink.attr('href') || '';
    const title = titleLink.text().trim();

    // Skip results without title or URL
    if (!title || !rawUrl) return;

    const url = extractRealUrl(rawUrl);

    const snippet = $el.find('.result__snippet').first().text().trim();

    results.push({
      title,
      url,
      snippet,
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    });
  });

  return results;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/engines/duckduckgo-html.test.ts`
Expected: PASS — all 8 tests pass

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/engines/duckduckgo-html.ts tests/engines/duckduckgo-html.test.ts
git commit -m "feat: add Node.js native DDG HTML engine with cheerio"
```

---

### Task 6: Integrate HTML Fallback in duckduckgo.ts

**Files:**
- Modify: `src/engines/duckduckgo.ts` (add HTML fallback to both search functions)
- Test: `tests/engines/duckduckgo-fallback.test.ts`

**Interfaces:**
- Consumes: `searchDuckDuckGoHtml` from `src/engines/duckduckgo-html.js`
- Produces: `searchDuckDuckGo()` now tries Python first, falls back to HTML engine

- [ ] **Step 1: Write the failing test**

Create `tests/engines/duckduckgo-fallback.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

// Mock the HTML fallback engine
vi.mock('../../src/engines/duckduckgo-html.js', () => ({
  searchDuckDuckGoHtml: vi.fn(async () => [
    { title: 'HTML Fallback Result', url: 'https://html.ex/1', snippet: 'from HTML', source: 'duckduckgo', engines: ['duckduckgo'] },
  ]),
  duckduckgoHtmlProvider: { id: 'duckduckgo', name: 'DuckDuckGo (HTML)', isFree: true, languages: ['en'] },
}));

import { execFileSync } from 'child_process';

describe('DDG Python → HTML fallback', () => {
  // Re-import in each test to reset the lazy cache (_ddgsChecked, _pythonBin)
  let searchDuckDuckGo: typeof import('../../src/engines/duckduckgo.js').searchDuckDuckGo;
  let searchDuckDuckGoHtml: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import to get fresh module with reset lazy cache
    const ddgMod = await import('../../src/engines/duckduckgo.js');
    searchDuckDuckGo = ddgMod.searchDuckDuckGo;

    const htmlMod = await import('../../src/engines/duckduckgo-html.js');
    searchDuckDuckGoHtml = htmlMod.searchDuckDuckGoHtml as ReturnType<typeof vi.fn>;
  });

  it('uses Python path when ddgs is available', async () => {
    vi.mocked(execFileSync).mockImplementation((_bin: string, args: string[]) => {
      // The first call is the ddgs version check
      if (args[0] === '-c') return '5.0.0\n';
      // Subsequent calls are search script invocations
      return JSON.stringify([{ title: 'Python Result', url: 'https://py.ex/1', snippet: 'from Python', source: 'duckduckgo' }]);
    });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Python Result');
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('falls back to HTML engine when ddgs is not available', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });

  it('falls back to HTML engine when Python search throws', async () => {
    // ddgs version check passes, search script throws
    vi.mocked(execFileSync)
      .mockReturnValueOnce('5.0.0\n')
      .mockImplementationOnce(() => {
        throw new Error('Python script error');
      });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engines/duckduckgo-fallback.test.ts`
Expected: FAIL — current `searchDuckDuckGo` returns `[]` when ddgs unavailable, doesn't call HTML engine

- [ ] **Step 3: Write minimal implementation**

In `src/engines/duckduckgo.ts`, add the import at the top (after existing imports):

```typescript
import { searchDuckDuckGoHtml } from './duckduckgo-html.js';
```

Replace the `searchDuckDuckGo` function body with fallback logic:

```typescript
/**
 * Search DuckDuckGo using ddgs Python library (bypasses anti-bot).
 * Falls back to Node.js HTML engine if Python/ddgs not available.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    // Python/ddgs not available — use Node.js HTML fallback
    logger.info('DDG: Falling back to Node.js HTML engine');
    return searchDuckDuckGoHtml(query, limit);
  }
  try {
    const output = execFileSync(
      pythonBin,
      [SCRIPT_PATH, query, String(limit)],
      {
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const results = JSON.parse(output.trim());
    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source || 'duckduckgo',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOENT')) {
      logger.warn({ python: pythonBin, script: SCRIPT_PATH }, 'DDG: Python binary not found, falling back to HTML engine');
    } else if (msg.includes('timeout')) {
      logger.warn('DDG: Python search timed out, falling back to HTML engine');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG Python search failed, falling back to HTML engine');
    }
    // Fall back to HTML engine on Python errors
    return searchDuckDuckGoHtml(query, limit);
  }
}
```

Replace the `searchDuckduckgoNews` function to add fallback note (news search doesn't have an HTML fallback yet, so just log clearly):

```typescript
/**
 * Search DuckDuckGo News using ddgs Python library.
 * Returns empty array if Python/ddgs not available (no HTML news fallback yet).
 */
export async function searchDuckduckgoNews(query: string, limit: number = 10, timeRange: string = 'w'): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    logger.info('DDG News: Python/ddgs not available, skipping (no HTML fallback for news)');
    return [];
  }
  const timeMap: Record<string, string> = { day: 'd', week: 'w', month: 'm' };
  const timelimit = timeMap[timeRange] || 'w';

  try {
    const output = execFileSync(
      pythonBin,
      [NEWS_SCRIPT_PATH, query, String(limit), timelimit],
      {
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const entries = JSON.parse(output.trim());
    return entries.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source_name || 'duckduckgo-news',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ err: msg.slice(0, 200) }, 'DDG News search failed');
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engines/duckduckgo-fallback.test.ts`
Expected: PASS — all 3 tests pass

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/engines/duckduckgo.ts tests/engines/duckduckgo-fallback.test.ts
git commit -m "feat: DDG engine falls back to Node.js HTML when Python unavailable"
```

---

### Task 7: Dockerfile — Remove Python

**Files:**
- Modify: `Dockerfile` (remove Python install from runtime stage)

**Interfaces:**
- No code interfaces — infrastructure only

- [ ] **Step 1: Modify Dockerfile**

Replace `Dockerfile` contents with:

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
EXPOSE 3000
ENV MODE=http
ENV PORT=3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds (cheerio is a pure JS library, no native deps)

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore: remove Python from Docker runtime — DDG uses HTML fallback"
```

---

### Task 8: Phase 2 Documentation Updates

**Files:**
- Modify: `README.md` (remove pip install requirement, note HTML fallback)
- Modify: `README-zh.md` (same, Chinese)
- Modify: `AGENTS.md` (update known traps)

**Interfaces:**
- No code interfaces — documentation only

- [ ] **Step 1: Update README.md Prerequisites section**

Replace the Prerequisites section (the version from Task 4) with:

```markdown
### Prerequisites

- Node.js >= 18

That's it. All search engines work out of the box.

> **Optional:** For enhanced DuckDuckGo results, install Python + ddgs:
> ```bash
> pip install ddgs
> ```
> Without this, DuckDuckGo uses a Node.js HTML engine automatically.
```

- [ ] **Step 2: Update README.md Dependencies table**

Replace the ddgs row in the Dependencies table with:

```markdown
| cheerio | MIT | DuckDuckGo HTML parser (Node.js native) |
| ddgs (Python, optional) | MIT | Enhanced DuckDuckGo backend (bypasses anti-bot) |
```

Remove the "Note: ddgs is a Python library..." paragraph below the table.

- [ ] **Step 3: Update README-zh.md**

Apply equivalent changes — remove `pip install ddgs` as a requirement, note HTML fallback.

Replace the Prerequisites section with:

```markdown
### 前置条件

- Node.js >= 18

安装即用，无需额外依赖。

> **可选：** 安装 Python + ddgs 可获得更好的 DuckDuckGo 结果：
> ```bash
> pip install ddgs
> ```
> 不安装时 DuckDuckGo 自动使用 Node.js HTML 引擎。
```

- [ ] **Step 4: Update AGENTS.md known traps**

Replace the ddgs known trap (the version from Task 4) with:

```markdown
- **ddgs 依赖**: Python 库 `ddgs` 为可选依赖。未安装时 DDG 引擎自动回退到 Node.js HTML 引擎（cheerio 解析）。Docker 镜像不含 Python，仅使用 HTML 引擎。`isDdgsAvailable()` 检测可用性，结果缓存在进程生命周期内
- **cheerio 依赖**: DuckDuckGo HTML 引擎依赖 cheerio（纯 JS，无 native binding），npm install 自动安装
```

- [ ] **Step 5: Update CHANGELOG.md**

Add entry at the top of CHANGELOG.md:

```markdown
## [Unreleased]

### Added
- DuckDuckGo HTML engine — Node.js native DDG search via cheerio, no Python required
- `isDdgsAvailable()` exported from DDG engine for health reporting
- DDG health report includes `ddgs_available` field
- `partialFailures` now correctly includes DDG unavailability with engine name

### Changed
- DDG engine: Python path preferred → HTML fallback when ddgs unavailable
- `findPython()` → lazy detection (cached, runs once per process)
- `console.error` → `logger.warn` in DDG engine
- Dockerfile: removed Python/ddgs from runtime image
- README: `pip install ddgs` is now optional, not required

### Fixed
- `partialFailures` entries now show correct engine name instead of "unknown"
```

- [ ] **Step 6: Commit**

```bash
git add README.md README-zh.md AGENTS.md CHANGELOG.md
git commit -m "docs: ddgs is optional, Node.js HTML engine is default fallback"
```

---

## Notes

### Design Decision: cheerio vs regex

The existing engines (Bing, Sogou, Baidu) use regex for HTML parsing. The plan document chose cheerio for the DDG HTML engine because:
1. cheerio is more robust to HTML structure variations
2. cheerio is lighter than Python+ddgs (≈3 deps vs a whole runtime)
3. DDG HTML structure is more complex than Bing (redirect URLs, nested structures)

If cheerio is undesirable, the existing `simulateDdgParse` regex in `tests/engines.test.ts` can be extracted into the engine instead. This would avoid the dependency but is more fragile.

### Python Scripts — Not Archived

The plan document mentions archiving `scripts/ddg-search.py` and `scripts/ddg-news-search.py`. However, since Phase 2 keeps the Python path as the **preferred** path (more stable), the scripts must remain. They are only unused in Docker (which doesn't install Python). Local users with `pip install ddgs` still benefit from the Python path.

### News Search — No HTML Fallback

`searchDuckduckgoNews()` does not have an HTML fallback in this plan. DDG's news endpoint (`https://duckduckgo.com/news`) has a different HTML structure. This can be added in a future iteration if needed. For now, news search returns `[]` when Python is unavailable.

### partialFailures Engine Name Fix

The existing code uses `engine: 'unknown'` in all failure entries. This plan fixes it to use the actual engine name (`batch[i]` / `paidToSearch[i]`). This is a bug fix that benefits all engines, not just DDG.
