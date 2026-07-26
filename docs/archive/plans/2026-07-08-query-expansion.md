# Adaptive Query Expansion — 自适应查询扩展

## Goal

在瀑布搜索置信度不足时，自动生成备选查询词重新搜索，交叉合并结果。Clay 式思路：数据不够就换角度问。

## Current vs Target

```
当前: 瀑布 Phase 1a → Phase 1b → Phase 2 → 输出
                                          ↑
                                    置信度还不够也只查一次

目标: 瀑布 Phase 1a → Phase 1b → Phase 2
                                      → 置信度不够? 
                                        → query_expand → 生成2个备选查询
                                        → 用备选查询重新瀑布搜索
                                        → 合并 + 去重 + 重打分 → 输出
```

## 策略（纯规则，不依赖 LLM）

| 策略 | 示例 | 生成式 |
|------|------|--------|
| "vs" 拆查询 | "Next.js vs Remix" → ["Next.js", "Remix"] | 2 个 |
| 去前缀 | "how to build MCP server" → "MCP server" | 1 个 |
| 提取核心词 | "best TypeScript framework 2026" → "TypeScript framework" | 1 个 |
| 技术同义词 | "js" → "javascript", "ts" → "typescript", "ai" → "artificial intelligence" | 各 1 个 |

最多生成 2 个备选查询，避免爆炸。

## Files

| File | Change |
|------|--------|
| `src/aggregation/query-expander.ts` | **新建** — 查询扩展器 |
| `src/tools/free-search.ts` | 在 waterfall 置信度不足时调 expander |
| `tests/query-expander.test.ts` | **新建** — 测试 |

## Task Breakdown

### Task 1: 查询扩展器

**New file:** `src/aggregation/query-expander.ts`

```typescript
const STOP_WORDS = new Set(['how', 'what', 'why', 'when', 'where', 'which', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'best', 'top', 'good', 'great']);

const TECH_SYNONYMS: Record<string, string[]> = {
  'js': ['javascript'],
  'ts': ['typescript'],
  'ai': ['artificial intelligence', 'machine learning'],
  'ml': ['machine learning'],
  'mcp': ['model context protocol'],
  'api': ['api', 'rest api'],
  'ui': ['user interface'],
  'ux': ['user experience'],
};

/**
 * 生成备选查询, 最多 2 个。
 * 纯规则, 无 LLM 依赖。
 */
export function expandQuery(query: string): string[] {
  const alternatives: string[] = [];
  
  // 策略1: "vs" 拆查询
  if (query.includes(' vs ') || query.includes(' versus ')) {
    const parts = query.split(/\s+(?:vs|versus)\s+/i);
    if (parts.length >= 2) {
      alternatives.push(parts[0].trim());
      alternatives.push(parts[1].trim());
    }
  }
  
  // 策略2: 去前缀 (how to / what is / best / top)
  if (alternatives.length < 2) {
    let stripped = query
      .replace(/^(how\s+to|what\s+is|what\s+are|why\s+do|best|top)\s+/i, '')
      .trim();
    if (stripped && stripped !== query && stripped.length > 2) {
      alternatives.push(stripped);
    }
  }
  
  // 策略3: 提取核心词 (去 stop words, 取最长 2-3 个词)
  if (alternatives.length < 2) {
    const words = query.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length >= 2) {
      const core = words.slice(0, Math.min(words.length, 3)).join(' ');
      if (core !== query && core.length > 2) {
        alternatives.push(core);
      }
    }
  }
  
  // 策略4: 技术同义词 (替换第一个匹配的)
  if (alternatives.length < 2) {
    const lower = query.toLowerCase();
    for (const [term, syns] of Object.entries(TECH_SYNONYMS)) {
      if (lower.includes(term)) {
        for (const syn of syns) {
          const expanded = query.replace(new RegExp(term, 'i'), syn);
          if (expanded !== query) {
            alternatives.push(expanded);
            break;
          }
        }
        break; // 只替换一种
      }
    }
  }
  
  return [...new Set(alternatives)].slice(0, 2);
}
```

### Task 2: 集成到瀑布搜索

**File:** `src/tools/free-search.ts`

在 `executeWaterfallSearch` 中, Phase 2 之后, 最终聚合之前:

```typescript
  // ── Phase 3: Query Expansion (if confidence still low) ─────────
  if (!basketFull) {
    const alternatives = expandQuery(query);
    if (alternatives.length > 0) {
      logger.info({ alternatives }, 'Phase 3: query expansion');
      for (const altQuery of alternatives) {
        // 对每个备选查询跑完整瀑布
        const altResults = await executeWaterfallSearch({
          ...options,
          query: altQuery,
          waterfall: true,
          enrich: false,  // 避免嵌套 enrich
        });
        if (altResults.results) {
          // 将 results 转换为 SearchResult[]
          for (const r of altResults.results) {
            allResults.push({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              source: 'expanded',
              engines: altResults.engines || [],
            });
          }
        }
      }
    }
  }
```

### Task 3: 单元测试

**New file:** `tests/query-expander.test.ts`

- `expandQuery("simple")` → `[]` (不需要扩展)
- `expandQuery("Next.js vs Remix")` → `["Next.js", "Remix"]`
- `expandQuery("how to build MCP server")` → `["MCP server"]`
- `expandQuery("best TypeScript framework 2026")` → `["TypeScript framework 2026"]` (去 stop words)
- `expandQuery("JS framework")` → `["javascript framework"]` (同义词)
- `expandQuery("")` → `[]`
- `expandQuery("short")` → `[]` (太短不扩)

## Acceptance Criteria

1. ✅ 不生成多于 2 个备选查询
2. ✅ "vs" 查询正确拆分为两个独立查询
3. ✅ 技术同义词正确替换 (js→javascript)
4. ✅ 去前缀不过度裁剪 (非前缀不动)
5. ✅ 空结果/短查询返回空数组
6. ✅ waterfall 中置信度足够时跳过扩展
7. ✅ `npm test` 全部通过

## Commands

```bash
npm run build
npx vitest run tests/query-expander.test.ts
npm test
```
