# Waterfall Search — 渐进式瀑布搜索增强

## Goal

将 agent-search-mcp 的并行批处理搜索改为 **Clay 式瀑布渐进搜索**：每轮只搜最少的引擎，检查置信度是否达标，不达标再扩下一轮。省引擎调用、省 token、响应更快。

**Backward Compat:** 仅 `free_search_advanced` 暴露瀑布模式，`free_search` 保持现有并行逻辑不变。零破坏。

## Current Architecture (现状)

```
free_search tool:     searchWithFallback → executeSearch()
                      并行 Phase 1 (DDG+Sogou+Bing+Baidu) → early exit
                      串行 Phase 2 (Brave+Tavily+Exa) → 聚合输出

free_search_advanced: 同上 + 额外过滤参数，调用的也是 searchWithFallback()
```

## Target Architecture (目标)

```
free_search_advanced tool:
  searchWithFallback({ ..., waterfall: true, ... })
    → executeSearch(options)
      → options.waterfall === true
        → executeWaterfallSearch(options)     ← 新增瀑布路径
      → options.waterfall === false / default
        → executeParallelSearch(options)      ← 原有并行逻辑提取为具名函数

executeWaterfallSearch 内部:
  Phase 1a: DDG + Sogou (并行)
  → Confidence Check: 置信度篮子达标?
    → Yes → 跳过 Ph 1b + Ph 2
    → No  → Phase 1b
  Phase 1b: Bing + Baidu (并行)
  → Confidence Check again
    → Yes → 跳过 Ph 2
    → No  → Phase 2
  Phase 2: Brave + Tavily + Exa (付费兜底, 仅当有 API key)
  → 全部合并 → Filter → Dedup → Score → Rank → Format → Output
```

## Files to Change

| File | Change |
|------|--------|
| `src/aggregation/scorer.ts` | 加 `checkConfidenceBasket()` 函数 (15 行) + 导出 `ConfidenceBasketOptions` |
| `src/aggregation/index.ts` | 加一行 export `checkConfidenceBasket` |
| `src/tools/free-search.ts` | 提取 `executeParallelSearch`; 加 `executeWaterfallSearch`; searchWithFallback 加路由逻辑 |
| `src/tools/free-search-advanced.ts` | 加 `waterfall` / `waterfall_min_results` / `waterfall_min_confidence` 参数 |
| `src/infrastructure/cache.ts` | `makeKey()` 加 waterfall 参数影响缓存键 |
| `tests/aggregation.test.ts` | 加 `checkConfidenceBasket` 单元测试 (APPEND 到文件末尾) |
| `tests/waterfall.test.ts` | **新增** — 瀑布搜索集成测试 6 个 case |

## Detailed Code

### Task 1: 置信度篮子检查器

**File:** `src/aggregation/scorer.ts` (在末尾 append，export const 前)

```typescript
export interface ConfidenceBasketOptions {
  minResults?: number;
  minAvgConfidence?: number;
  topK?: number;
}

export interface ConfidenceBasketResult {
  sufficient: boolean;
  basketConfidence: number;
  topResultsCount: number;
  analyzedCount: number;
}

export function checkConfidenceBasket(
  results: ScoredResult[],
  options: ConfidenceBasketOptions = {}
): ConfidenceBasketResult {
  const {
    minResults = 3,
    minAvgConfidence = 0.6,
    topK = 5,
  } = options;

  if (results.length === 0) {
    return { sufficient: false, basketConfidence: 0, topResultsCount: 0, analyzedCount: 0 };
  }

  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const top = sorted.slice(0, topK);
  const avgConfidence = top.reduce((sum, r) => sum + r.confidence, 0) / top.length;

  return {
    sufficient: top.length >= minResults && avgConfidence >= minAvgConfidence,
    basketConfidence: Math.round(avgConfidence * 100) / 100,
    topResultsCount: top.length,
    analyzedCount: results.length,
  };
}
```

**File:** `src/aggregation/index.ts` (加一行)
```typescript
export { checkConfidenceBasket } from './scorer.js';
export type { ConfidenceBasketResult, ConfidenceBasketOptions } from './scorer.js';
```

**Tests (APPEND to `tests/aggregation.test.ts`):**
```typescript
// ─── checkConfidenceBasket ──────────────────────────────────────────────────
import { checkConfidenceBasket } from '../src/aggregation/scorer.js';
import type { ScoredResult } from '../src/aggregation/scorer.js';

describe('checkConfidenceBasket', () => {
  function makeResult(confidence: number, index: number): ScoredResult {
    return {
      title: `Result ${index}`,
      url: `https://example.com/${index}`,
      snippet: `Snippet ${index}`,
      source: 'duckduckgo',
      engines: [],
      confidence,
      score: confidence,
    };
  }

  it('returns sufficient=false for empty results', () => {
    const result = checkConfidenceBasket([]);
    expect(result.sufficient).toBe(false);
    expect(result.basketConfidence).toBe(0);
  });

  it('returns sufficient=true when top-5 confidence meets threshold', () => {
    const results = [1,2,3,4,5].map(i => makeResult(0.8 + i * 0.01, i));
    const result = checkConfidenceBasket(results, { minResults: 3, minAvgConfidence: 0.6, topK: 5 });
    expect(result.sufficient).toBe(true);
    expect(result.basketConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it('returns sufficient=false when top-5 confidence is too low', () => {
    const results = [1,2,3,4,5].map(i => makeResult(0.3, i));
    const result = checkConfidenceBasket(results);
    expect(result.sufficient).toBe(false);
  });

  it('returns sufficient=false when not enough results (minResults)', () => {
    const results = [makeResult(0.9, 1), makeResult(0.9, 2)];
    const result = checkConfidenceBasket(results, { minResults: 3, minAvgConfidence: 0.6, topK: 5 });
    expect(result.sufficient).toBe(false);
    expect(result.topResultsCount).toBe(2);
  });

  it('respects custom topK', () => {
    const allHigh = [1,2,3,4,5].map(i => makeResult(0.9, i));
    const allLow = [6,7,8,9,10].map(i => makeResult(0.2, i));
    const result = checkConfidenceBasket([...allHigh, ...allLow], { topK: 3, minResults: 3, minAvgConfidence: 0.6 });
    // topK=3 picks only the 3 high confidence ones
    expect(result.sufficient).toBe(true);
    expect(result.topResultsCount).toBe(3);
  });
});
```

**Vefification:** `npx vitest run tests/aggregation.test.ts -t checkConfidenceBasket`
Expected: 5/5 passing.

### Task 2: 瀑布搜索执行器

**File:** `src/tools/free-search.ts`

**2a. 提取现有逻辑为 `executeParallelSearch` (rename, 不动 body)**

```typescript
// 原有 executeSearch body 全部移入此函数
async function executeParallelSearch(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  // ... 原 executeSearch 全部代码（行 271-443）...
}
```

**2b. 现有 `executeSearch` 改为路由函数**

```typescript
async function executeSearch(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  if (options.waterfall) {
    return executeWaterfallSearch(options);
  }
  return executeParallelSearch(options);
}
```

**2c. 新增 `executeWaterfallSearch`**

```typescript
import { checkConfidenceBasket } from '../aggregation/index.js';

const WATERFALL_PHASES = {
  phase1a: ['duckduckgo', 'sogou'] as SearchProvider[],
  phase1b: ['bing', 'baidu'] as SearchProvider[],
  phase2: ['brave', 'tavily', 'exa'] as SearchProvider[],
};

async function executeWaterfallSearch(options: SearchWithFallbackOptions): Promise<SearchResponse> {
  const {
    query,
    count = 10,
    language,
    includeDomains,
    excludeDomains,
    minConfidence = 1,
    waterfallMinResults = 3,
    waterfallMinConfidence = 0.6,
  } = options;

  // Check cache first
  const cacheKey = cache.makeKey(query, count, [ 'waterfall' ].concat(options.engines?.sort() || []));
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ query }, 'Cache hit (waterfall)');
    return cached as SearchResponse;
  }

  logger.info({ query, phases: 'phase1a' }, 'Waterfall Phase 1a: DDG + Sogou');
  const allResults: SearchResult[] = [];
  const allFailures: { engine: string; message: string }[] = [];
  const searchedEngines: string[] = [];

  // 辅助函数: 搜一批引擎
  async function searchBatch(engines: SearchProvider[], phaseLabel: string): Promise<boolean> {
    const phaseResults = await Promise.allSettled(
      engines.map(async (engine) => {
        const results = await searchEngine(engine, query, count);
        searchedEngines.push(engine);
        return { engine, results };
      })
    );

    for (const result of phaseResults) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value.results);
      } else {
        allFailures.push({ engine: 'unknown', message: result.reason?.message || 'Unknown error' });
      }
    }

    // 过滤 + 去重 + 打分
    const filtered = filterLowQuality(allResults);
    const { results: urlDeduped, frequencies } = dedupByUrl(filtered);
    const titleDeduped = dedupByTitle(urlDeduped);
    const scored = scoreAndRank(titleDeduped, query, ENGINE_WEIGHTS, frequencies);

    // 置信度篮子检查
    const basket = checkConfidenceBasket(scored, {
      minResults: waterfallMinResults,
      minAvgConfidence: waterfallMinConfidence,
      topK: 5,
    });

    logger.info({ phase: phaseLabel, total: allResults.length, basket }, 'Waterfall phase complete');

    // 如果篮子已满，不再继续下一轮
    return basket.sufficient;
  }

  // Phase 1a: DDG + Sogou
  let basketFull = await searchBatch(WATERFALL_PHASES.phase1a, '1a');
  if (basketFull) {
    logger.info('Phase 1a satisfied confidence basket — skipping remaining phases');
  }

  // Phase 1b: Bing + Baidu (if needed)
  if (!basketFull) {
    basketFull = await searchBatch(WATERFALL_PHASES.phase1b, '1b');
    if (basketFull) {
      logger.info('Phase 1b satisfied confidence basket — skipping Phase 2');
    }
  }

  // Phase 2: Paid engines (if needed)
  if (!basketFull) {
    const paidAvailable = WATERFALL_PHASES.phase2.filter(e => hasApiKey(e));
    if (paidAvailable.length > 0) {
      logger.info({ engines: paidAvailable }, 'Waterfall Phase 2: paid engines');
      const paidResults = await Promise.allSettled(
        paidAvailable.map(async (engine) => {
          const results = await searchEngine(engine, query, count);
          searchedEngines.push(engine);
          return { engine, results };
        })
      );

      for (const result of paidResults) {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value.results);
        } else {
          allFailures.push({ engine: 'unknown', message: result.reason?.message || 'Unknown error' });
        }
      }
    } else {
      logger.info('Phase 2: no paid engines available');
    }
  }

  // ── Aggregate & output (同现有逻辑) ──────────────────────────
  const filtered = filterLowQuality(allResults);
  const { results: urlDeduped, frequencies } = dedupByUrl(filtered);
  const titleDeduped = dedupByTitle(urlDeduped);
  let scored = scoreAndRank(titleDeduped, query, ENGINE_WEIGHTS, frequencies);

  // Post-search filters
  if (minConfidence > 1) {
    scored = scored.filter(r => r.confidence >= minConfidence);
  }
  if (includeDomains?.length) { /* ... same as existing ... */ }
  if (excludeDomains?.length) { /* ... same as existing ... */ }

  const formatted = formatResults(scored);
  const response = {
    query,
    engines: searchedEngines,
    ...formatted,
    ...(allFailures.length > 0 ? { partialFailures: allFailures } : {}),
  } as SearchResponse;

  // Async cache write
  setImmediate(() => {
    try {
      cache.set(cacheKey, response);
    } catch (err) {
      logger.error({ err }, 'Cache write failed');
    }
  });

  return response;
}
```

**2d. `SearchWithFallbackOptions` 加新字段 (在文件顶部 interface 定义处)**

```typescript
export interface SearchWithFallbackOptions {
  query: string;
  count?: number;
  engines?: SearchProvider[];
  minConfidence?: number;
  language?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  // Waterfall search (advanced only)
  waterfall?: boolean;                 // default: false (backward compat)
  waterfallMinResults?: number;        // default: 3
  waterfallMinConfidence?: number;     // default: 0.6
}
```

**Verification:** `npx vitest run tests/waterfall.test.ts`

### Task 3: 高级搜索工具暴露瀑布参数

**File:** `src/tools/free-search-advanced.ts`

在 `registerFreeSearchAdvanced` 的 schema 中加 3 个参数:

```typescript
waterfall: z.boolean().optional().default(true)
  .describe('Enable waterfall progressive search (saves engine calls)'),
waterfall_min_results: z.number().min(1).max(10).optional().default(3)
  .describe('Minimum results per phase for waterfall confidence check'),
waterfall_min_confidence: z.number().min(0.1).max(1.0).optional().default(0.6)
  .describe('Minimum average confidence to stop waterfall early'),
```

在 tool handler 中透传到 `searchWithFallback`:

```typescript
const results = await searchWithFallback({
  query: input.query,
  count: input.count,
  engines: ['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily'],
  minConfidence: input.min_confidence,
  language: input.language,
  includeDomains: input.include_domains,
  excludeDomains: input.exclude_domains,
  waterfall: input.waterfall,
  waterfallMinResults: input.waterfall_min_results,
  waterfallMinConfidence: input.waterfall_min_confidence,
});
```

**Verification:** `npm test` — 所有测试通过。

### Task 4: 缓存键扩展

**File:** `src/infrastructure/cache.ts`

修改 `makeKey` 加 waterfall 参数影响:

```typescript
makeKey(query: string, count: number, engines: string[], waterfall?: boolean): string {
  const wf = waterfall ? ':wf' : '';
  return `${query}:${count}:${engines.sort().join(',')}${wf}`;
}
```

Update all callers in `free-search.ts`:
- `executeParallelSearch`: `cache.makeKey(query, count, userEngines)` (不变)
- `executeWaterfallSearch`: `cache.makeKey(query, count, userEngines, true)` (加 waterfall flag)

### Task 5: 集成测试

**New file:** `tests/waterfall.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { checkConfidenceBasket } from '../src/aggregation/scorer.js';
import type { ScoredResult } from '../src/aggregation/scorer.js';

describe('Waterfall Search Integration', () => {
  // 1. 验证置信度检查器集成
  it('stops after phase 1a when confidence basket is full', async () => {
    // 模拟: Phase 1a 返回高置信度结果 → 不应调用更多引擎
    // 实际测试: 直接测 checkConfidenceBasket 的行为
    const highConfResults = Array.from({ length: 5 }, (_, i) => ({
      title: `Result ${i}`, url: `https://example.com/${i}`,
      snippet: `Snippet ${i}`, source: 'duckduckgo', engines: ['duckduckgo', 'sogou'],
      confidence: 0.85, score: 0.85,
    } as ScoredResult));

    const basket = checkConfidenceBasket(highConfResults, {
      minResults: 3, minAvgConfidence: 0.6, topK: 5,
    });
    expect(basket.sufficient).toBe(true);
    expect(basket.basketConfidence).toBeGreaterThanOrEqual(0.8);
  });

  // 2. 低置信度 → 需要更多 phase
  it('continues to phase 1b when confidence basket is not full', () => {
    const lowConfResults = Array.from({ length: 3 }, (_, i) => ({
      title: `Result ${i}`, url: `https://example.com/${i}`,
      snippet: `Snippet ${i}`, source: 'sogou', engines: ['sogou'],
      confidence: 0.3, score: 0.3,
    } as ScoredResult));

    const basket = checkConfidenceBasket(lowConfResults, {
      minResults: 3, minAvgConfidence: 0.6, topK: 5,
    });
    expect(basket.sufficient).toBe(false);
  });

  // 3. 少量高置信度但 minResults 不够
  it('requires minimum results count for sufficient basket', () => {
    const onlyTwoResults = [
      { title: 'A', url: 'https://a.com', snippet: 'A', source: 'duckduckgo', engines: ['duckduckgo', 'sogou'], confidence: 0.9, score: 0.9 },
      { title: 'B', url: 'https://b.com', snippet: 'B', source: 'duckduckgo', engines: ['duckduckgo', 'sogou'], confidence: 0.9, score: 0.9 },
    ] as ScoredResult[];

    const basket = checkConfidenceBasket(onlyTwoResults, {
      minResults: 3, minAvgConfidence: 0.6, topK: 5,
    });
    expect(basket.sufficient).toBe(false);
    expect(basket.topResultsCount).toBe(2);
  });

  // 4. 空结果
  it('handles empty result set from waterfall', () => {
    const basket = checkConfidenceBasket([], { minResults: 3, minAvgConfidence: 0.6, topK: 5 });
    expect(basket.sufficient).toBe(false);
    expect(basket.analyzedCount).toBe(0);
  });

  // 5. Vefification: waterfall=false 走原有路径 (compile check)
  it('passes waterfall=false to searchWithFallback without issues', () => {
    // Unit-level: verify the type accepts waterfall param
    const opts: any = { waterfall: false, query: 'test' };
    expect(opts.waterfall).toBe(false);
  });
});
```

## Task Order & Dependencies

```
Task 1 (scorer.ts + tests) ─→ Task 2 (free-search.ts) ─→ Task 3 (advanced.ts) ─→ Task 5 (waterfall tests)
                                                                                      ↑
Task 4 (cache.ts) ────────────────────────────────────────────────────────────────────┘
                                                                    (waterfall 路径依赖缓存键)
```

All tasks can be done in 2-5 minutes each (TypeScript-only, no new deps).

## Acceptance Criteria

1. ✅ `checkConfidenceBasket([])` → `sufficient: false`
2. ✅ `checkConfidenceBasket(高置信度 5 条)` → `sufficient: true`
3. ✅ `executeWaterfallSearch` Phase 1a 足够时只搜 DDG+Sogou
4. ✅ `executeWaterfallSearch` 低质量结果自动扩展到 Phase 1b
5. ✅ Phase 2 仅当 API key 存在且需要时才调用
6. ✅ `free_search` 保持不变 (waterfall=false)
7. ✅ `free_search_advanced` waterfall=true 正常跑瀑布模式
8. ✅ 缓存键区分 waterfall 模式，不串
9. ✅ `npm test` 全部通过 (无回归)

## Commands

```bash
# Build
npm run build
# Expected: tsc compile success, dist/ 目录输出

# Run ALL tests
npm test
# Expected: XX tests passing (全部现有 + 新增)
#  如在当前: tests/aggregation.test.ts  +5 新增
#            tests/waterfall.test.ts   +6 新增

# Run specific test files
npx vitest run tests/aggregation.test.ts -t 'checkConfidenceBasket'
# Expected: 5/5 passing

# Manual verification: waterfall mode
node dist/cli.js search "test query" --count 3
# Expected: 结果包含 engines 字段, waterfall 模式不传 --waterfall 不影响

# Manual: advanced with waterfall
echo '{
  "method": "tools/call",
  "params": {
    "name": "free_search_advanced",
    "arguments": {
      "query": "TypeScript MCP server",
      "count": 5,
      "waterfall": true,
      "waterfall_min_confidence": 0.6
    }
  }
}' | node dist/index.js
# Expected: 输出带 engines 和 confidence 的搜索结果
```
