---
type: ArchitectureDoc
title: agent-search-mcp — 系统架构
timestamp: '2026-07-22T12:30:00+08:00'
description: 项目架构总览：分层、数据流、关键模式
tags:
  - agent-search-mcp
  - architecture
---

# 系统架构

> 三层架构：工具层（Agent 接口） → 聚合层（质量引擎） → 引擎层（搜索后端）。
> 所有路径都有降级：如果上层失败，下层保证不中断。

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                   Agent 客户端                    │
│    (Claude Code / Cursor / Hermes / Codex)      │
└──────────────────┬──────────────────────────────┘
                   │ JSON-RPC (stdio / HTTP)
                   ▼
┌─────────────────────────────────────────────────┐
│              MCP 工具层 (tools/)                  │
│                                                   │
│  free_search    free_search_advanced    free_extract│
│  free_search_news  search_with_synthesis          │
│  fetch_github_readme  fetch_csdn  fetch_juejin    │
│  search://capabilities  search://health           │
├─────────────────────────────────────────────────┤
│             聚合层 (aggregation/)                  │
│                                                   │
│  QueryExpander → MultiEngineSearch →              │
│    → Dedup → FilterLowQuality → Scorer →         │
│    → Enricher → Formatter                        │
│                                                   │
│  瀑布流水线: Phase 1 → [自信度检查] → Phase 2 → ...│
├─────────────────────────────────────────────────┤
│              引擎层 (engines/)                     │
│                                                   │
│  免费: DDG  Sogou  Bing  Baidu  Wikipedia        │
│        Startpage  Yandex  Mojeek                 │
│  付费: Brave  Tavily  Exa                        │
│  回退: DDG-html(cheerio) → Lite-DDG              │
├─────────────────────────────────────────────────┤
│           基础设施层 (infrastructure/)              │
│                                                   │
│  Cache(RateLimiter)  Config  Security  Health     │
│  ToolPolicy  VersionCheck  Logger  HTTP Server    │
└─────────────────────────────────────────────────┘
```

## 数据流

### 搜索请求 (free_search)

```
Agent → free_search(query, engines?, limit?)
         │
         ├── 1. 解析配置 (config.ts)
         ├── 2. 检查缓存 (cache.ts)
         ├── 3. 限速检查 (rate-limiter.ts)
         ├── 4. 引擎过滤 (tool-policy.ts + engine allow/deny)
         │
         ├── Phase 1: DDG + Sogou (并发)
         │      ↓
         ├── 自信度检查: Top-5 平均 ≥ 0.6?
         │    YES → 跳到结果处理
         │    NO  → Phase 2
         │
         ├── Phase 2: Bing + Baidu (并发)
         │      ↓
         ├── 自信度检查: Top-5 平均 ≥ 0.6?
         │    YES → 跳结果处理
         │    NO  → Phase 3
         │
         ├── Phase 3: Brave + Tavily + Exa (并发)
         │
         ├── 5. 去重 (dedup.ts)
         ├── 6. 低质量过滤 (filterLowQuality)
         ├── 7. 评分 + 排序 (scorer.ts)
         ├── 8. 内容丰富化 (enricher.ts — 低置信度结果提取全文)
         ├── 9. 格式化输出 (format.ts)
         │
         └── Agent ← 结构化搜索结果 + 安全元数据
```

### 内容提取 (free_extract)

```
Agent → free_extract(url, max_length?)
         │
         ├── 1. SSRF 验证 (url-validator.ts)
         │      └── 阻止: localhost / 私有IP / 元数据端点
         ├── 2. 安全检查 (security.ts)
         │      └── 检测: prompt injection / 钓鱼URL
         ├── 3. 提取内容 (Jina Reader API)
         └── Agent ← markdown 内容
```

## 关键模式

### 1. 瀑布搜索 (Waterfall Search)

**目标**: 用最少引擎调用次数获得足够置信度的结果。

```
Phase 1: DDG + Sogou (2 免费引擎, 轻量)
  → 计算 Top-5 平均置信度
  → ≥ 0.6? 停止. < 0.6? Phase 2.

Phase 2: Bing + Baidu (2 免费引擎, 中等)
  → 同上自信度检查
  → ≥ 0.6? 停止. < 0.6? Phase 3.

Phase 3: Brave + Tavily + Exa (3 付费引擎, 全量)
  → 返回所有结果
```

**收益**: 50-75% 场景在 Phase 1 或 2 停止，节省付费引擎调用。

### 2. 多源验证 (Multi-Source Verification)

每个结果记录被多少个不同引擎返回。被 3 个引擎验证的结果置信度高于只被 1 个引擎找到的。

- URL 去重时记录引擎来源数
- 评分时加频次权重（每多一个引擎 +0.1，上限 +0.3）
- 置信度等级: 1(单源) / 2(双源) / 3(三源+)

### 3. 降级哲学 (Graceful Degradation)

每一层都有降级路径，确保不中断:

| 层 | 降级路径 |
|----|---------|
| 引擎 | 失败 → 空数组 → 跳过（不退化为整个搜索失败） |
| 内容丰富化 | Jina Reader 超时 → 使用原始摘要 |
| 查询扩展 | 扩展失败 → 使用原始查询 |
| 语言检测 | 检测失败 → 默认英文 |
| DDG 搜索 | Python ddgs → cheerio HTML → Lite HTML → 空数组 |
| 付费引擎 | 无 API key → 自动跳过（不报错） |

### 4. 惰性初始化 (Lazy Initialization)

检测只在首次需要时执行，结果缓存到进程生命周期:

- **Python ddgs 检测**: 首次调用 `searchDuckDuckGo` 时缓存
- **引擎健康状态**: 首次失败后缓存降级结果
- **Rate limiter**: 首次调用时创建，后续复用

## 目录职责

| 目录 | 职责 | 核心文件 |
|------|------|---------|
| `src/tools/` | MCP 工具注册 (Agent 接口) | 每工具独立文件 |
| `src/engines/` | 搜索引擎适配 (每引擎独立) | `{name}.ts` + 统一签名 |
| `src/aggregation/` | 搜索结果处理管道 | 纯函数，可测试 |
| `src/synthesis/` | 搜索结果合成 (prompt_hint) | 零 LLM 依赖 |
| `src/infrastructure/` | 共享基础设施 | 跨层可用 |
| `tests/` | 与 src/ 镜像的测试目录 | vitest + mock |

## 引擎签名约定

所有搜索引擎遵循统一接口:

```typescript
// src/engines/{name}.ts
export async function search{Name}(
  query: string,
  count: number,
  options?: { signal?: AbortSignal }
): Promise<SearchResult[]>
```

- 失败时不抛异常 → 返回空数组
- 超时通过 `AbortSignal.timeout(N)` 控制
- 有 rate limit 的引擎（如 Brave）在函数内处理限速

## MCP 工具约定

所有 MCP 工具遵循统一注册模式:

```typescript
// src/tools/{name}.ts
export function register{Name}(server: McpServer): void
```

- `McpServer` 从 @modelcontextprotocol/sdk 的 Server 类型
- 使用 zod 做参数验证
- 描述遵循 TDQS 标准: **Best for / Not recommended for** + `@readOnly` 标注

## 配置源

所有配置通过环境变量传入，不走配置文件:

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ENABLED_TOOLS` | (全部) | 逗号分隔，仅在列表中的工具注册 |
| `DISABLED_TOOLS` | (无) | 逗号分隔，禁用列表中的工具 |
| `ALLOWED_ENGINES` | (全部) | 逗号分隔，限制可用引擎 |
| `DENIED_ENGINES` | (无) | 逗号分隔，禁用引擎 |
| `BRAVE_API_KEY` | — | Brave Search API key |
| `TAVILY_API_KEY` | — | Tavily Search API key |
| `EXA_API_KEY` | — | Exa Search API key |
| `JINA_API_KEY` | — | Jina Reader API key (内容提取) |
| `MODE` | stdio | 运行模式: stdio / http / both |
| `PORT` | 3000 | HTTP 模式端口 |

## 相关文档

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE-IMPROVEMENTS.md](ARCHITECTURE-IMPROVEMENTS.md) | 从竞品提炼的 8 个架构模式（已实现 5/8） |
| [conventions.md](conventions.md) | 编码规范（命名/导入/签名） |
| [AGENTS.md](../AGENTS.md) | 项目地图（Agent 第一站） |
| [superpowers/plans/2026-07-22-iteration-roadmap.md](../superpowers/plans/2026-07-22-iteration-roadmap.md) | 当前路线图 |
