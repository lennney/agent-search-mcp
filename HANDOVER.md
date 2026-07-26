---
type: HandoverDoc
title: Agent Search MCP handover
timestamp: '2026-07-26T17:35:00+08:00'
description: 当前状态、稳定契约和下一步
tags:
- agent-search-mcp
- handover
---

# Agent Search MCP — Handover

## 当前状态

- `package.json` 当前版本为 `3.1.3`；精确变更历史以 Git 和 `CHANGELOG.md` 为准。
- 稳定产品面是 Node.js >=18.17、TypeScript ESM、MCP stdio/HTTP 和 `fasm` CLI。
- 12 个适配器均进入统一路由：8 个零密钥，4 个可选 API。
- Slim Guard 是独立产品；本仓库只维护可选证据交接合同。
- `2026-07-28` 能力仅在 `experiments/mcp-2026/` 验证，不宣称生产兼容。
- 当前不 bump 版本、不 push、不发布 npm/GitHub Release。

## 稳定契约

### 搜索与证据

- `src/aggregation/search-evidence.ts` 统一处理域名策略、去重、评分和质量门；
  并行与瀑布路由必须复用它。
- 域名过滤在去重前执行，只接受精确主机名或真实子域。
- Adapter 名不等于独立来源；`source_count` 按
  `docs/contracts/provider-families-v1.json` 的 upstream family 统计。
- relevance、confidence 和 provider-family 覆盖分别达标后才能提前停止；
  `meta.execution` 解释实际调用、阶段和失败。
- Semantic dedup/rerank 开启后，路由检查点使用变换后的展示篮子。
- `free_search_advanced.time_range` 仅保留输入兼容；传入时返回机器可读
  `UNSUPPORTED_FILTER`，不得静默忽略。
- `free_search` 与 `free_search_advanced` 共享 Search Evidence Packet；
  `structuredContent` 是完整机器合同，文本通道只提供紧凑视图。

### 上游可靠性

- DDG 主链为纯 Node 的 Web preload → HTML → Lite，不探测 Python/ddgs；
  Lite 只在 HTML HTTP 202 后、同一 deadline 内尝试一次。
- DDG/Sogou 共享 request-local Undici 代理 transport；只读取显式引擎配置或
  `USE_PROXY=true` + `PROXY_URL`，不读取 ambient proxy，也不泄露凭证。
- DDG/Sogou 反爬统一返回 `bot_challenge` 并进入有界冷却。
- `ProviderCooldownStore` 和 `SearchCache` 都以小型 store interface 解耦；
  内存是默认实现，本地持久化必须显式启用并对损坏/过期数据 fail open。
- `SearchRequestBudget` 统一限制适配器尝试、总耗时、原始结果和证据字符；
  超限返回观察值、上限与 `budget_exhausted`，调用方取消仍直接 reject。
- 瀑布查询扩展只执行一代，生成查询不得再次扩展。
- 显式请求缺少凭证的可选 API 时返回 `permission_denied`，不得伪装成零结果。

### 注册与评测边界

- Engine registry 是引擎分组、凭证来源和公开能力矩阵的单一来源；
  `toolRegistry` 是工具注册与公开工具矩阵的单一来源。
- README 中带 marker 的能力表由 `capabilities:generate` 生成，
  `capabilities:check` 阻止运行时与文档漂移。
- 冻结 benchmark 只验证格式、Token 和指标代码，不代表搜索质量。
- `query-classifier-v1` 仍是 benchmark-only 实验；没有 pooled live quality
  证据前不得接入生产路由。
- Pooled capture 保留系统内部信号；blinded reviewer packet 必须移除信号，
  只有 completed adjudication 能生成阈值校准报告。
- `benchmark:import-external` 只离线归一化已有竞品导出；竞品 SDK、凭证和
  网络逻辑不得进入 MCP/CLI runtime。
- `fasm doctor` 只读本地配置，不联网、不写配置、不暴露 key/token/proxy 值。

## 网络使用规则

- 默认 `npm test` 不访问真实搜索或提取服务；联网 E2E 仅通过
  `npm run test:e2e:live` 显式运行。
- Runner qualification 默认查询间隔为 10 秒，拒绝小于 1 秒的节奏，
  不自动重试；`insufficient-runner` 写出脱敏报告后以退出码 2 失败关闭。
- 当前出口最近一次 DDG/Wikipedia qualification 为 8/10，DDG 已出现
  HTTP 202 challenge；不要从该出口继续探测或捕获质量 fixture。
- 不使用指纹轮换、挑战规避或高频重试来获取 DDG/Sogou 结果。

## 当前验证

- 默认离线门禁：68 个测试文件，708 passed，2 个联网 E2E 按设计 skipped。
- TypeScript/Windows build、能力矩阵漂移、冻结 Token benchmark 和 bootstrap
  quality benchmark：通过；bootstrap 仍不具备质量声明资格。
- Lint：0 errors；既有 warnings 未在本轮扩散。
- 外部导入、pooling、runner qualification 的纯函数与失败边界有单元测试。

## 下一步

1. 在合法且已资格确认的备用网络出口，低频捕获非空 Sogou 中文 fixture 和
   DDG Lite 机会性 fixture；当前出口不再使用。
2. 使用同一 query set 获取 Agent Search 与真实对照系统结果；对照系统通过
   离线 importer 进入 pooling，不能把配置级探针写成产品对比。
3. 完成两模型 pointwise review 与第三模型分歧裁决，再运行
   `benchmark:calibrate-relevance`；完成前保持内部阈值 `0.35` 不变。
4. 只有满足路线图的样本量、语言/类别切片和 adjudication gate 后，才可发布
   搜索质量或 DDG 可用率数字。

## 文档权威

- 当前状态与下一步：本文件。
- 产品和使用方式：`README.md` / `README_zh.md`。
- 架构：`docs/architecture.md`。
- 当前计划：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`。
- 评测方法：`benchmarks/README.md`。
- 历史变更：Git / `CHANGELOG.md`；plan/review/evidence 只作追溯，不复制到本文件。
