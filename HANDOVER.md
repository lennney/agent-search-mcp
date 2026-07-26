---
type: HandoverDoc
title: Agent Search MCP handover
timestamp: '2026-07-26T23:52:28+08:00'
description: 当前状态、稳定契约和下一步
tags:
- agent-search-mcp
- handover
---

# Agent Search MCP — Handover

## 当前状态

- `package.json` 当前版本为 `3.2.0`；精确变更历史以 Git 和 `CHANGELOG.md` 为准。
- 稳定产品面是 Node.js >=18.17、TypeScript ESM、MCP stdio/HTTP 和 `fasm` CLI。
- 16 个适配器均进入统一路由：9 个零密钥，7 个可选 API。Wiby 是零密钥
  小型网页补充源；Tencent WSA、Bocha、Serper 需要用户自带凭证。
- `free_search_news` 与 Bing News RSS 路径已在发布前移除；当前没有独立新闻工具，
  也不宣称通用搜索支持可强制执行的时间范围。
- Slim Guard 是独立产品；本仓库只维护可选证据交接合同。
- `2026-07-28` 能力仅在 `experiments/mcp-2026/` 验证，不宣称生产兼容。
- 本轮授权仅覆盖提交并推送 PR 分支、观察 CI；不发布 npm/GitHub Release，
  不创建 tag，不更新 MCP Registry。

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
- Wiby 只在免费瀑布后段尝试，共享公共服务失败不自动重试，并在结果中保留
  上游要求的链接署名。
- Tencent WSA 与 Sogou、Serper 与 Startpage/Google 分别保守归为同一
  provider family；同上游的多适配器不能虚增独立来源数。
- 默认路由由 `SearchProviderMode` 统一解释：`free_first` 不会因为存在 API Key
  自动产生付费调用；只有显式 `quality_escalation` / `paid_first` 才使用已配置
  可选渠道，默认只选 `PAID_ENGINE_ORDER` 中首个有凭证的渠道；`free_only`
  始终禁止付费调用。除此安全上限外，显式 `engines` 仍是权威选择。

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

- 默认离线门禁：73 个测试文件，742 passed，2 个联网 E2E 按设计 skipped。
- TypeScript/Windows build、能力矩阵漂移、冻结 Token benchmark 和 bootstrap
  quality benchmark：通过；bootstrap 仍不具备质量声明资格。
- Lint：0 errors、0 warnings；`npm run lint` 通过 `--max-warnings 0`
  阻止 warning 回归。Server/adapter 日志统一写入结构化 stderr，CLI 的
  人类输出使用精确文件级例外。
- Registry 元数据由测试约束：包名、描述、版本和 7 个可选 Provider 凭证必须与
  `package.json` 及引擎注册表一致；Registry 的 stdio 安装项不再暴露
  `MODE` / `PORT` 传输覆盖。
- 外部导入、pooling、runner qualification 的纯函数与失败边界有单元测试。
- 上一个精确候选来自
  `a1de48515d84748d8bf40e66d8853266e0dd1268`；唯一 tarball 包含 77 个文件，
  大小 106,180 bytes，SHA-256 为
  `002EBC7C7AC7E4B8330C1AB25288CD4DB71917ECBC4C2A5C7CB76BE08BFABAEA`。
  Windows 与 WSL2 Ubuntu 的 Node 18.20.8 / 20.20.2 / 22.23.1 安装、
  doctor、平台 launcher、stdio initialize/tools/list 和退出全部通过，均发现
  8 个工具及 16 个 Provider，并实际解析
  `@hono/node-server` 1.19.15；没有调用搜索或提取工具。
- Web Crypto 与工具面收敛改变了源码；上述 tarball 现在只作历史证据，不能发布。
  PR CI 通过后必须从最终提交重新生成唯一候选并重跑发布矩阵。
- 六个安装单元均提示 `whatwg-encoding@3.1.1` 已弃用，来源是固定的
  `cheerio@1.0.0` 传递依赖；没有 `EBADENGINE`。Pino 10 候选 `ff5dea0`
  及旧候选 `0c89ec1` / `3f170675` 只作历史证据，不得发布。
- Hono 官方 GHSA-frvp-7c67-39w9 公告将 1.19.15 列为 1.x 修复版本；
  `npm audit --omit=dev` 的 registry payload 仍用 `<2.0.5` 范围，因此继续报告
  2 个 moderate。保留该元数据差异，不降级 MCP SDK，也不强制引入要求
  Node 20 的 Hono 2.x；本项目不注册受影响的 `serve-static`。
- 当前分支保留 `73c34969` 的一次有限 DDG Live E2E 作为时间点非降级观察；
  DDG Web/HTML/Lite 主链没有改变；移除新闻工具不影响该主链。本轮未重复探测
  DDG/Sogou，也不据此声明可用率或准确率。

## 下一步

1. PR CI 通过后，从最终提交重新生成唯一 tarball 并重跑 Windows/Linux
   Node 18/20/22 发布矩阵；npm publish、tag/Release 和 MCP Registry 仍需分别授权。
2. Agent Search 上线后，再单独部署产品主页、把 GitHub Homepage 改到
   `/en/agent-search-mcp`，随后刷新 Glama 等目录。
3. 不为本次发布重复探测 DDG/Sogou；只有后续搜索主链发生变化，或进入单独的
   低频质量采样任务时，才重新取得联网授权。
4. 使用同一 query set 获取 Agent Search 与真实对照系统结果；对照系统通过
   离线 importer 进入 pooling，不能把配置级探针写成产品对比。
5. 完成两模型 pointwise review 与第三模型分歧裁决，再运行
   `benchmark:calibrate-relevance`；完成前保持内部阈值 `0.35` 不变。
6. 只有满足路线图的样本量、语言/类别切片和 adjudication gate 后，才可发布
   搜索质量或 DDG 可用率数字。

## 文档权威

- 当前状态与下一步：本文件。
- 产品和使用方式：`README.md` / `README_zh.md`。
- 架构：`docs/architecture.md`。
- 当前计划：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`。
- 评测方法：`benchmarks/README.md`。
- 历史变更：Git / `CHANGELOG.md`；plan/review/evidence 只作追溯，不复制到本文件。
- 当前发布候选证据：
  `docs/evidence/2026-07-26-release-candidate-a1de485.md`。
