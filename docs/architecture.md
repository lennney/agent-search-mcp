---
type: ArchitectureDoc
title: agent-search-mcp — 系统架构
timestamp: '2026-07-26T16:30:00+08:00'
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
│  瀑布流水线: Phase 1 → [多维质量门] → Phase 2 → ...│
├─────────────────────────────────────────────────┤
│              引擎层 (engines/)                     │
│                                                   │
│  免费: DDG  Sogou  Bing  Baidu  Wikipedia        │
│        Startpage  Yandex  Mojeek                 │
│  可选 API: Brave  Tavily  Exa  You.com           │
│  DDG 回退: Web preload → HTML → Lite             │
├─────────────────────────────────────────────────┤
│           基础设施层 (infrastructure/)              │
│                                                   │
│  Cache  RateLimiter  Config  Security  Health     │
│  ToolPolicy  VersionCheck  Logger  HTTP Server    │
└─────────────────────────────────────────────────┘
```

## 数据流

### 基础搜索请求 (`free_search`)

```
Agent → free_search(query, engines?, limit?)
         │
         ├── 1. 解析配置、缓存与 engine allow/deny
         ├── 2. 只选择请求中的 adapter（默认 DDG + Sogou）
         ├── 3. 按 upstream provider family 分组
         │      └── 同 family adapter 只在前一个失败或无可用结果时顺序回退
         ├── 4. 零密钥 adapter 有界批处理
         ├── 5. 数量 + relevance + confidence + provider-family 质量门
         ├── 6. 仅在短缺/门未过时调用已显式选择且有凭证的可选 API
         ├── 7. 去重、评分、过滤与可选内容丰富化
         ├── 8. 格式化输出并附 stop_reason / partialFailures
         │
         └── Agent ← 结构化搜索结果 + 安全元数据
```

### 渐进搜索请求 (`free_search_advanced` / `search_with_synthesis`)

Advanced 和 synthesis 路径启用固定 waterfall：1a（DDG/Sogou）→
1b（Bing/Baidu）→ 1c（Wikipedia/Startpage/Yandex/Mojeek）→
可选 API → 确定性查询变体。每一阶段都重算同一个多维质量门。

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

**目标**: 用最少引擎调用次数获得足够、相关、可靠且来源独立的结果。

```
Phase 1a: DDG + Sogou (2 免费引擎, 轻量)
  → 检查结果数量、逐条 relevance、平均 confidence、provider family
  → 全部达标才停止，否则继续。

Phase 1b: Bing + Baidu (2 免费引擎, 中等)
  → 同上质量门。

Phase 1c: Wikipedia + Startpage + Yandex + Mojeek
  → 同上质量门。

Phase 2: Brave + Tavily + Exa + You.com
  → 未传 engines 时调用所有已有凭证的 adapter；
    传入 engines 时只调用显式选择且已有凭证的 adapter。
  → 再次检查质量门，不足才进入查询变体。
```

返回的 `meta.execution` 会说明 `stop_reason` 和质量门观测值。历史
调用节省数字只适用于当时的查询集和 runner，不是当前门槛的通用保证。
两项语义功能默认关闭。启用后，每个 routing checkpoint 都会先执行
semantic dedup/rerank，再以 post-semantic display basket 决定是否跳过
后续免费/可选阶段或查询扩展；`quality_gate_stage` 会公开实际判断阶段。

### 2. 多源验证 (Multi-Source Verification)

每个结果记录被多少个独立 upstream provider family 返回。Adapter
名称不等于独立来源；例如 DuckDuckGo/Bing 被保守地归入同一 family。

- URL 去重时记录独立 provider family 数
- 评分时只按独立 family 增加频次权重
- `source_count` 是 family 计数；`confidence` 仍是 0–1 的来源可靠性，
  只接受有限的独立 corroboration bonus

### 3. 降级哲学 (Graceful Degradation)

每一层都有降级路径，确保不中断:

| 层 | 降级路径 |
|----|---------|
| 引擎 | 直调可软失败为空数组；编排路径用 `throwOnError` 收集 `partialFailures` 后继续 |
| 内容丰富化 | Jina Reader 超时 → 使用原始摘要 |
| 查询扩展 | 扩展失败 → 使用原始查询 |
| 语言检测 | 检测失败 → 默认英文 |
| DDG 搜索 | 页面签发 Web preload → cheerio HTML → 同源 Lite 机会性尝试 → 显式失败/空数组 |
| 付费引擎 | 无 API key → 自动跳过（不报错） |

### 4. 惰性初始化 (Lazy Initialization)

运行状态只在首次需要时创建，并缓存到进程生命周期:

- **代理连接池**: DDG/Sogou 首次代理请求时按脱敏配置创建
- **引擎健康状态**: 首次失败后缓存降级结果
- **Rate limiter**: 首次调用时创建，后续复用

DDG 不再探测 Python 或启动子进程；Web、HTML 与 Lite 是同一 provider
family。Web 表示只接受
`links.duckduckgo.com/d.js` 的精确 HTTPS 路径，并在同一查询会话中保持
一致 User-Agent。Lite 只在 HTML 202 后、同一总 deadline 内尝试一次；
组合失败标记为不可重试，避免外层再次运行整条 Lite 链。任何表示都不增加
`source_count`，也不被描述为限流绕过。

DDG/Sogou 的 CAPTCHA、202 challenge 和 `/antispider/` 会转换为结构化
`bot_challenge`。健康控制面立即暂停该 provider 一小时；到期后才允许新探测，
避免在已知受限的网络出口上继续消耗延迟和上游配额。

### 5. 运行控制面不占默认工具槽位

运行状态通过 MCP Resource 和 HTTP probe 暴露，而不是再注册一个默认可见的
`status` 工具：

| 入口 | 内容 | Secret 规则 |
|---|---|---|
| `search://health` | provider、熔断和冷却状态 | 不返回 API Key |
| `mcp://health/metrics` | 延迟、错误和进程内 cache 指标 | 不返回查询/结果正文 |
| `search://capabilities` | 当前工具、引擎和能力说明 | 从运行时注册事实维护 |
| HTTP `GET /health` | 进程/负载均衡探针与协议状态 | 不返回 MCP 工具结果或认证 token |

这样既能让 Agent/运维检查状态，又不增加每次工具选择需要阅读的 schema Token。
未来若增加 `fasm doctor`，只显示配置项是否存在、来源和修复建议，所有 key/token
都必须脱敏。

### 6. 预算分层

当前稳定核心已经有三类不同预算，不能合并成一个含义模糊的“Budget Manager”：

1. **执行预算**：单请求 deadline、取消、阶段和有界并发；
2. **证据预算**：`EVIDENCE_BUDGET_CHARS` 限制整个响应的 passage 字符数；
3. **结果预算**：count、Compact、`MAX_FULL_RESULTS` 和 semantic top-K。

如果以后增加跨请求/持久 session budget，必须给出明确 owner、窗口、reset 时间和
机器可读的 `BUDGET_EXCEEDED`；不能把拒绝伪装成零结果，也不能用进程级计数冒充
per-task 限额。

### 7. MCP Web Hound 对照后的边界

对
[`mcp-web-hound@f468da9`](https://github.com/ilgizar-valiullin/mcp-web-hound/tree/f468da9943952fddc1ed71ca977b18b60f40ca11)
的固定源码检查确认了三个值得保留的边界：

- 持久 exact/semantic query cache 是**候选 backend**，不是默认依赖。进入稳定面前
  必须通过 Node 18、Windows、安装体积、冷启动、RSS、freshness、隔离和错误复用门；
- intent classifier 只有在实际改变并改善 routing policy 时才有价值。当前继续以
  确定性语言/工具/策略路由为基线，语义 dedup/rerank 保持 opt-in；
- GitHub/GitLab 搜索属于专用代码托管能力，不因为“功能完整”就塞进默认 Web Search
  surface。现有 `fetch_github_readme` 保持窄接口；新增工具需有真实需求证据。

详细源码证据、数据校正和不应照搬的实现见
[Agent Search 产品架构调查](research/2026-07-26-agent-search-product-architecture.md#mcp-web-hound)。

## 目录职责

| 目录 | 职责 | 核心文件 |
|------|------|---------|
| `src/tools/` | MCP 工具注册 (Agent 接口) | 每工具独立文件 |
| `src/engines/` | 搜索引擎适配 (每引擎独立) | `{name}.ts` + 统一签名 |
| `src/aggregation/` | 搜索证据评估与结果处理管道 | `search-evidence.ts` 统一过滤、去重、评分和质量门 |
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
  options?: { signal?: AbortSignal; throwOnError?: boolean }
): Promise<SearchResult[]>
```

- 直接调用默认软失败为空数组；编排器设置 `throwOnError`，把失败保留为
  响应级 `partialFailures`
- 超时通过 `AbortSignal.timeout(N)` 控制
- 统一 `RateLimiter`、健康状态和重试策略位于编排层

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
| `YDC_API_KEY` | — | You.com Search API key |
| `SEARCH_PROVIDER_MODE` | free_first | 免费默认、质量升级、付费优先或仅免费 |
| `PAID_ENGINE_ORDER` | brave,exa,tavily,youcom | 按顺序选择首个已配置可选渠道 |
| `MODE` | stdio | 运行模式: stdio / http / both |
| `PORT` | 3000 | HTTP 模式端口 |

## 相关文档

| 文档 | 内容 |
|------|------|
| [research/2026-07-26-agent-search-product-architecture.md](research/2026-07-26-agent-search-product-architecture.md) | 当前竞品源码、Agent/MCP 分层和架构策略 |
| [plans/2026-07-22-maintainability-architecture.md](plans/2026-07-22-maintainability-architecture.md) | 当前可维护性收敛计划：AppMetadata、EngineCatalog、SearchRuntime、提取与 transport |
| [conventions.md](conventions.md) | 编码规范（命名/导入/签名） |
| [AGENTS.md](../AGENTS.md) | 项目地图（Agent 第一站） |
| [superpowers/plans/2026-07-22-iteration-roadmap.md](superpowers/plans/2026-07-22-iteration-roadmap.md) | 当前路线图 |
