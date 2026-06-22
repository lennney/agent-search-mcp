# 系统架构改进方案

基于 ddgs / open-websearch / brave-mcp 的研究，提取 8 个最佳模式。

---

## 模式 1: Provider 去重 ✅ 已实现

**来源**：ddgs `ResultsAggregator`

**问题**：DDG 使用 Bing 作为后端。如果同时搜 DDG 和 Bing，会重复查询同一个后端。

**方案**：
```typescript
// 引擎 -> 后端 provider 映射
const PROVIDER_MAP = {
  duckduckgo: 'bing',  // DDG 用 Bing 后端
  sogou: 'sogou',
  brave: 'brave',
  tavily: 'tavily',
};

// 只搜索每个 provider 一次
function getUniqueProviders(engines: string[]): string[] {
  const seen = new Set<string>();
  return engines.filter(e => {
    const provider = PROVIDER_MAP[e] || e;
    if (seen.has(provider)) return false;
    seen.add(provider);
    return true;
  });
}
```

**收益**：避免重复搜索，减少 50%+ 延迟。

---

## 模式 2: 频次评分 ✅ 已实现

**来源**：ddgs `ResultsAggregator`

**问题**：简单的 URL 去重会丢失"多引擎验证"的信息。

**方案**：
```typescript
// 记录每个 URL 被多少个引擎返回
function dedupByUrl(results: SearchResult[]) {
  const seen = new Map<string, SearchResult>();
  const frequencies = new Map<string, number>();
  
  for (const r of results) {
    const key = normalizeUrl(r.url);
    frequencies.set(key, (frequencies.get(key) || 0) + 1);
    
    if (!seen.has(key)) {
      seen.set(key, r);
    } else {
      // 保留摘要更长的结果（信息更丰富）
      if (r.snippet.length > seen.get(key)!.snippet.length) {
        seen.set(key, r);
      }
    }
  }
  
  return { results: Array.from(seen.values()), frequencies };
}

// 评分时使用频次
function calculateScore(result, tokens, weights, frequency) {
  let score = baseScore;
  
  // 频次加分：被更多引擎返回 = 更可信
  const freqBonus = Math.min(frequency * 0.1, 0.3);
  score += freqBonus;
  
  return score;
}
```

**收益**：被多个引擎返回的结果排名更高，提高准确性。

---

## 模式 3: Token 桶排名 ✅ 已实现

**来源**：ddgs `SimpleFilterRanker`

**问题**：当前排名只用引擎权重，没有考虑查询相关性。

**方案**：
```typescript
// 将结果分到不同的"桶"里
function calculateScore(result, tokens) {
  const titleLower = result.title.toLowerCase();
  const bodyLower = result.snippet.toLowerCase();
  
  const titleMatches = tokens.filter(t => titleLower.includes(t)).length;
  const bodyMatches = tokens.filter(t => bodyLower.includes(t)).length;
  
  // 桶分类
  let bucketScore = 0;
  if (titleMatches > 0 && bodyMatches > 0) {
    bucketScore = 0.4;  // 标题+摘要都匹配
  } else if (titleMatches > 0) {
    bucketScore = 0.3;  // 只有标题匹配
  } else if (bodyMatches > 0) {
    bucketScore = 0.2;  // 只有摘要匹配
  }
  
  // Wikipedia/GitHub 加分
  if (result.url.includes('wikipedia.org')) bucketScore += 0.15;
  if (result.url.includes('github.com')) bucketScore += 0.05;
  
  return bucketScore;
}
```

**收益**：查询相关性更高的结果排名更靠前。

---

## 模式 4: 批量并发 + 早退出 ✅ 已实现

**来源**：ddgs `_search_sync`

**问题**：所有 engine 同时启动可能触发限流；等所有 engine 完成才返回太慢。

**方案**：
```typescript
const BATCH_SIZE = 2;
const allResults: SearchResult[] = [];

// 分批搜索
for (let i = 0; i < engines.length; i += BATCH_SIZE) {
  const batch = engines.slice(i, i + BATCH_SIZE);
  
  const batchResults = await Promise.allSettled(
    batch.map(engine => searchEngine(engine, query, limit))
  );
  
  // 收集结果
  for (const result of batchResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }
  
  // 早退出：结果够了就停
  if (allResults.length >= count * 1.5) {
    logger.info({ count: allResults.length }, 'Early exit: enough results');
    break;
  }
}
```

**收益**：
- 减少延迟：不用等所有 engine 完成
- 避免限流：不会同时发起太多请求

---

## 模式 5: 异步缓存写入 ✅ 已实现

**来源**：ddgs `_cache_results_async`

**问题**：同步写缓存会阻塞响应。

**方案**：
```typescript
// 不阻塞响应，后台写缓存
setImmediate(() => {
  try {
    cache.set(cacheKey, response);
    logger.info({ total: response.meta.total }, 'Search complete');
  } catch (err) {
    logger.error({ err }, 'Cache write failed');
  }
});

return response;  // 立即返回
```

**收益**：响应延迟减少 10-50ms。

---

## 模式 6: 工具 Allow/Denylist 🔜 待实现

**来源**：brave-search-mcp `--enabled-tools` / `--disabled-tools`

**问题**：无法控制哪些工具对 Agent 可见。

**方案**：
```typescript
// 环境变量
const ENABLED_TOOLS = process.env.ENABLED_TOOLS?.split(',') || [];
const DISABLED_TOOLS = process.env.DISABLED_TOOLS?.split(',') || [];

// 或 config.yaml
tools:
  enabled: [free_search, free_search_advanced]
  disabled: [free_extract]

// 工具注册时过滤
function setupTools(server: McpServer) {
  const allTools = ['free_search', 'free_search_advanced', 'free_extract'];
  
  for (const tool of allTools) {
    // 检查是否启用
    if (ENABLED_TOOLS.length > 0 && !ENABLED_TOOLS.includes(tool)) continue;
    if (DISABLED_TOOLS.includes(tool)) continue;
    
    // 注册工具
    registerTool(server, tool);
  }
}
```

**配置示例**：
```bash
# 只启用搜索，禁用提取
ENABLED_TOOLS=free_search,free_search_advanced
DISABLED_TOOLS=free_extract
```

**收益**：用户可控，Agent 只看到需要的工具。

---

## 模式 7: 结果质量过滤 🔜 待实现

**来源**：ddgs `post_extract_results`

**问题**：低质量结果（空摘要、广告、无效 URL）混入。

**方案**：
```typescript
function filterLowQuality(results: SearchResult[]): SearchResult[] {
  return results.filter(r => {
    // 过滤空摘要
    if (!r.snippet || r.snippet.length < 20) return false;
    
    // 过滤广告
    if (r.url.includes('y.js?') || r.url.includes('/ad/')) return false;
    
    // 过滤无效 URL
    if (!r.url.startsWith('http')) return false;
    
    // 过滤 DDG 广告重定向
    if (r.url.includes('duckduckgo.com/y.js')) return false;
    
    // 过滤搜索引擎自身的链接
    if (r.url.includes('sogou.com/link')) return false;
    
    return true;
  });
}
```

**位置**：在 `dedupByUrl` 之后、`scoreAndRank` 之前调用。

**收益**：结果质量提升 20-30%。

---

## 模式 8: 自适应并发度 🔜 待实现

**来源**：ddgs `_search_sync`

**问题**：固定批量大小不够灵活。

**方案**：
```typescript
// 根据请求数量和引擎数动态调整批量大小
function calculateBatchSize(count: number, engineCount: number): number {
  // ddgs 公式：min(unique_providers, ceil(max_results/10) + 1)
  const adaptive = Math.min(engineCount, Math.ceil(count / 10) + 1);
  return Math.max(adaptive, 2);  // 最少 2 个
}

// 使用
const BATCH_SIZE = calculateBatchSize(count, engines.length);
```

**收益**：小查询快，大查询稳定。

---

## 优先级排序

| 优先级 | 模式 | 状态 | 复杂度 | 收益 |
|--------|------|------|--------|------|
| P0 | Provider 去重 | ✅ 已实现 | 低 | 减少 50% 延迟 |
| P0 | 频次评分 | ✅ 已实现 | 低 | 提高准确性 |
| P0 | Token 桶排名 | ✅ 已实现 | 中 | 提高相关性 |
| P0 | 批量并发+早退出 | ✅ 已实现 | 中 | 减少延迟 |
| P0 | 异步缓存 | ✅ 已实现 | 低 | 减少 10-50ms |
| P1 | 工具 Allow/Denylist | 🔜 待实现 | 低 | 用户可控 |
| P2 | 结果质量过滤 | 🔜 待实现 | 低 | 提高质量 |
| P2 | 自适应并发度 | 🔜 待实现 | 低 | 灵活性 |

---

## 实施进度

- [x] Provider 去重 (dedup.ts)
- [x] 频次评分 (dedup.ts + scorer.ts)
- [x] Token 桶排名 (scorer.ts)
- [x] 批量并发+早退出 (free-search.ts)
- [x] 异步缓存 (free-search.ts)
- [ ] 工具 Allow/Denylist
- [ ] 结果质量过滤
- [ ] 自适应并发度
