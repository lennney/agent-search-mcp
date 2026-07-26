---
type: HandoverDoc
title: Agent Search MCP handover
timestamp: '2026-07-26T16:10:00+08:00'
description: 当前状态、核心契约和下一步
tags:
- agent-search-mcp
- handover
---

# Agent Search MCP — Handover

## 当前状态

- `package.json` 当前版本为 `3.1.3`；检查点以当前 Git HEAD 为准。
- 稳定产品面是 Node.js >=18.17、TypeScript ESM、MCP stdio/HTTP 和 `fasm` CLI。
- 12 个适配器均进入统一路由：8 个零密钥，4 个可选 API。
- Slim Guard 是独立产品；本仓库只维护可选证据交接合同。
- `2026-07-28` 仅在 `experiments/mcp-2026/` 验证，尚不宣称生产兼容。
- 本轮不 bump 版本，不 push，不发布 npm/GitHub Release。

## 核心契约

- `src/aggregation/search-evidence.ts` 是搜索结果过滤、域名策略、去重、
  评分和质量门的统一 interface；并行与瀑布路由必须复用它。
- 域名过滤在去重前执行，只接受精确主机名或真实子域，避免相似域名误命中，
  也避免被排除结果提前压掉允许域名的同标题结果。
- Adapter 名不等于独立来源；`source_count` 按
  `docs/contracts/provider-families-v1.json` 的 upstream provider family 统计。
- 原始数量不能单独提前停止；relevance、confidence 和 provider-family
  覆盖必须分别达标，执行结果通过 `meta.execution` 解释。
- 开启 semantic dedup/rerank 后，每个路由检查点都必须用变换后的展示篮子
  决定是否继续，并通过 `quality_gate_stage` 区分判断阶段。
- `free_search_advanced.time_range` 保留输入兼容但已弃用；传入时在引擎调用前
  返回机器可读的 `UNSUPPORTED_FILTER`，不再静默返回未过滤结果。
- DDG Lite 只在 HTML HTTP 202 后、同一 deadline 内尝试一次，不能增加增信。
- DDG 主链已收敛为纯 Node 的页面签发 Web preload → HTML → Lite；不再探测
  Python/ddgs 或启动子进程。所有表示属于同一 provider family。
- DDG/Sogou 共享 request-local Undici 代理 transport；支持引擎级覆盖和
  `USE_PROXY=true` + `PROXY_URL`，不读取 ambient proxy 变量，凭证不进入错误。
  DDG/Sogou 反爬挑战统一返回 `bot_challenge` 并冷却。
- 瀑布查询扩展只执行一代；生成的备选查询不得再次触发查询扩展。
- 冻结 benchmark 只验证格式、Token 和指标代码，不代表搜索质量。
- pooled capture 保留每个系统的内部路由信号，但 blinded reviewer packet
  必须移除这些信号；只有 completed adjudication 能生成阈值校准报告。
- `free_search` 与 `free_search_advanced` 共用带 `outputSchema` 的 Search
  Evidence Packet；`structuredContent` 保留完整机器合同，文本通道只提供紧凑视图。
- `fasm doctor` 只检查本地配置，不联网探测搜索源、不写配置；稳定 JSON 合同为
  `doctor-report-v1`，只暴露状态和配置来源，不暴露 key/token/proxy 值。
- 显式请求可选 API 适配器但凭证缺失或空白时，必须返回
  `permission_denied`，不得伪装成零结果。

## 当前验证

- 稳定测试：643 passed / 60 files。
- 实验 MCP 2026：21 passed / 7 files。
- TypeScript/Windows build、冻结 Token benchmark 和 bootstrap quality
  benchmark：通过；bootstrap 仍不具备质量声明资格。
- Lint：0 errors / 64 个既有 warnings。
- Node 18.20.8 transport 冒烟、npm pack dry-run，以及打包后 Windows
  `fasm.cmd` 真实 DDG 搜索和 `doctor-report-v1`：通过；发布包不再包含
  `scripts/**`。audit 无 high/critical，仍有 MCP SDK/Hono 链上的 2 个 moderate。

## 下一步

1. 当前 runner qualification 已用 DDG/Wikipedia 配置通过 10/10 查询；下一步
   捕获真正的 Agent Search 与比较系统 pooled result，不能把配置级探测写成产品对比。
2. 使用已实现的显式代理 transport 和合法备用网络出口捕获非空 Sogou 中文
   fixture；当前出口的 `/antispider/` 只作为结构化失败证据。
3. 完成两模型 pointwise review 和第三模型分歧裁决，再运行
   `npm run benchmark:calibrate-relevance`；校准报告就绪前保持 `0.35` 不变。
4. 继续 P1.2：定义跨引擎调用数、耗时、结果数和证据字符数的统一请求预算；
   超限必须返回机器可读的观察值与上限。

## 文档权威

- 当前状态：本文件。
- 产品和使用方式：`README.md` / `README_zh.md`。
- 架构：`docs/architecture.md`。
- 当前计划：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`。
- 评测方法：`benchmarks/README.md`。
- 历史 plan/review/evidence 只作追溯，不复制到 HANDOVER。

## 2026-07-26 request-budget checkpoint

- `SearchRequestBudget` owns adapter-attempt, elapsed-time, raw-result, and
  evidence-character limits across parallel, waterfall, retry, and expansion.
- Hard exhaustion returns observed/limit metadata and `budget_exhausted`;
  caller cancellation still rejects. Adapters remain config-independent.
- Live smoke: pure-Node DDG returned 10 results. Sogou produced a structured
  `bot_challenge`; DDG+Sogou still returned DDG evidence with that failure.
- Next P1.2 item: a replaceable durable provider-cooldown store.

## 2026-07-26 provider-cooldown checkpoint

- `ProviderCooldownStore` is the seam; memory remains the default adapter and
  `PROVIDER_COOLDOWN_STORE_PATH` opts into restart-safe local JSON state;
  two independent Node processes verified challenge capture then cooldown skip.
- Stored records contain only provider, failure type, and expiry. Corrupt or
  expired state fails open; policy/cooldown skips remain in `partialFailures`.
- Next roadmap item: prototype the opt-in persistent exact-result cache behind
  a similarly replaceable store interface.

## 2026-07-26 persistent exact-cache checkpoint

- `SearchCache` now owns one small store interface; memory remains the default,
  while `SEARCH_CACHE_DIRECTORY` opts into atomic local-file persistence.
- Versioned hashed keys bind filters, routing, provider policy, evidence schema,
  output policy, and TTL. Only positive non-budget-exhausted responses persist;
  stale/corrupt data fails open and cached rate-limit snapshots are discarded.
- `benchmark:exact-cache` records cold start, RSS, p95 read/write, hit rate,
  stale/error reuse, and eviction. CI runs it on Linux and Windows with Node
  18/20/22. No native/vector dependency was added.
- Next roadmap item: add a deterministic routing classifier as advisory evidence
  before it can influence engine selection.
