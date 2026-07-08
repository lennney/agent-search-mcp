# Content Enrichment — 搜索结果内容丰富化

## Goal

搜索结果返回后，对 top-N 低置信度或 snippet 过短的条目，主动提取全文内容回填到 snippet，提升 agent 看到的上下文质量。

## Current vs Target

```
当前: 搜索结果 → 打分 → 排序 → 截断 snippet(200字) → 输出
                                   ↑
                              可能是"不详"或"无描述"

目标: 搜索结果 → 打分 → 排序 → ENRICHMENT PASS → 截断 snippet → 输出
                                   ↓
                       对 top-3 低置信度结果调 Jina Reader
                       提取全文 → 合并到 snippet → 提高置信度
```

## Files to Change

| File | Change |
|------|--------|
| `src/aggregation/enricher.ts` | **新增** — 内容丰富器 |
| `src/tools/free-search.ts` | 在 `executeWaterfallSearch` + `executeParallelSearch` 的结果聚合后加 enrichment pass |
| `src/tools/free-search.ts` | `SearchWithFallbackOptions` 加 3 个 enrich 参数 |
| `src/tools/free-search-advanced.ts` | schema 暴露 enrich 参数 |
| `tests/enricher.test.ts` | **新增** — 丰富器单元测试 |

## Task Breakdown

### Task 1: Enricher 模块

**New file:** `src/aggregation/enricher.ts`

```typescript
import { validateUrl } from '../infrastructure/url-validator.js';
import type { ScoredResult } from './scorer.js';

export interface EnrichOptions {
  maxEnrich?: number;           // 最多丰富几条 (default: 3)
  minConfidence?: number;       // 仅丰富低于此置信度的 (0-1 scale, default: 0.33 — 低置信度)
  minSnippetLength?: number;    // 仅丰富 snippet 短于此长度的 (default: 80)
  maxLength?: number;           // 提取内容最大字符 (default: 3000)
}

export interface EnrichResult {
  enriched: number;             // 实际丰富了多少条
  failures: number;             // 提取失败多少条
  results: ScoredResult[];      // 丰富后的结果集
}

/**
 * 对搜索结果做内容丰富化:
 * 1. 筛选低置信度/短 snippet 的结果
 * 2. 对每个 URL 调 Jina Reader 提取全文
 * 3. 将提取内容合并回 snippet
 * 4. 提高置信度 (+1, 上限3)
 */
export async function enrichResults(
  results: ScoredResult[],
  options?: EnrichOptions
): Promise<EnrichResult>
```

**Logic:**
```typescript
// 1. 筛选候选: confidence < minConfidence (0-1 scale) 或 snippet.length < minSnippetLength
// 2. 取 top-N (按 score 排序取 maxEnrich 条)
// 3. 对每条并行调 fetch(`https://r.jina.ai/${url}`)
//    - 超时 5s, 失败不中断
// 4. 成功: 提取内容前 3000 字 → 合并到 snippet + confidence += 0.33 (上限 1.0)
// 5. 失败: 记录 failures, 保持原样
// 6. 注意: 内部置信度是 0-1 浮点 (不是外部 1-3 整数)
// 7. 返回 { enriched, failures, results }
```

**Tests:**
- 空结果 → enriched=0
- 全部高置信度 → 不触发提取
- 混合结果 → 只丰富低置信度部分
- 提取失败 → 记录 failures, 不中断
- 置信度上浮 +1 但不超过 3

### Task 2: 集成到搜索管线

**File:** `src/tools/free-search.ts`

**2a. `SearchWithFallbackOptions` 追加:**
```typescript
  enrich?: boolean;              // 启用内容丰富化 (default: false, 仅 advanced 默认 true)
  enrichMax?: number;            // 最多丰富几条 (default: 3)
  enrichMinConfidence?: number;  // 丰富低于该置信度的 (0-1 scale, default: 0.33)
```

**2b. 在 `executeWaterfallSearch` 和 `executeParallelSearch` 的聚合输出前加 enrichment pass:**
```typescript
  // 在 formatResults(scored) 之前
  if (options.enrich) {
    const enriched = await enrichResults(scored, {
      maxEnrich: options.enrichMax,
      minConfidence: options.enrichMinConfidence,
    });
    scored = enriched.results as ScoredResult[];
    logger.info({ enriched: enriched.enriched, failures: enriched.failures }, 'Content enrichment');
  }
```

### Task 3: 高级搜索暴露参数

**File:** `src/tools/free-search-advanced.ts`

```typescript
      enrich: z.boolean().optional().default(true)
        .describe('Enable content enrichment (extract full page content for low-confidence results)'),
      enrich_max: z.number().min(1).max(10).optional().default(3)
        .describe('Max results to enrich per search'),
```

透传到 `searchWithFallback`:
```typescript
          enrich: input.enrich,
          enrichMax: input.enrich_max,
```

## Acceptance Criteria

1. ✅ `enrichResults([])` → enriched=0, failures=0
2. ✅ 低置信度结果被丰富后 snippet 变长
3. ✅ 丰富后 confidence +0.33 (上限 1.0)
4. ✅ 提取失败不中断整个搜索
5. ✅ `free_search` 默认 enrich=false (向后兼容)
6. ✅ `free_search_advanced` 默认 enrich=true
7. ✅ `npm test` 全部通过

## Commands

```bash
npm run build
npx vitest run tests/enricher.test.ts
npm test
```
