---
type: HandoverDoc
title: Agent Search MCP handover
timestamp: '2026-08-08'
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
- `v3.2.0` 已发布到 npm `latest`，`v3.2.0-beta.0` 仍保留在 `beta` tag；
  本地 `package.json` / `server.json` 已将描述收敛到同一事实句。
- GitHub repository homepage 仍需要在仓库 Settings 中改为网站 canonical 产品页；
  这项外部设置本轮因浏览器未登录而未提交。

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

- 当前离线门禁：84 个测试文件，831 passed，2 个联网 E2E 按设计 skipped。
- TypeScript/Windows build、lint、package manifest、能力矩阵漂移、冻结 Token/format
  benchmark、quality verify、30-query validator、competitive dry-run、exact cache 和
  intent-routing 全部通过；bootstrap 仍不具备质量声明资格。
- 本地 `main` 包含 `7f628fc` 和 `2d2e7a4` 两个检查点，领先 `origin/main` 2 个提交；
  尚未 push。P1.5 实现和本轮文档更新仍在工作区，尚未提交。
- Lint：0 errors、0 warnings；`npm run lint` 通过 `--max-warnings 0`
  阻止 warning 回归。Server/adapter 日志统一写入结构化 stderr，CLI 的
  人类输出使用精确文件级例外。
- Registry 元数据由测试约束：包名、描述、版本和 7 个可选 Provider 凭证必须与
  `package.json` 及引擎注册表一致；Registry 的 stdio 安装项不再暴露
  `MODE` / `PORT` 传输覆盖。
- 外部导入、pooling、runner qualification 的纯函数与失败边界有单元测试。
- 上一个历史候选来自
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
- 当前分支保留 `73c34969` 的一次有限 DDG Live E2E 作为历史时间点观察。P1 双语
  `SearchRequestContext` 已改变编排后的 DDG 请求上下文，因此旧证据不再证明当前
  精确请求链。当前曾触发 DDG challenge 的出口禁止复用，也不据此声明可用率或准确率。

## 下一步

1. 在单独批准后，使用同一 query set 获取 Agent Search 与真实对照系统结果；对照系统通过
   离线 importer 进入 pooling，不能把配置级探针写成产品对比。
2. 完成两模型 pointwise review 与第三模型分歧裁决，再运行
   `benchmark:calibrate-relevance`；完成前保持内部阈值 `0.35` 不变。
3. 只有满足路线图的样本量、语言/类别切片和 adjudication gate 后，才可发布
   搜索质量或 DDG 可用率数字。
4. 上述产品证据完成后，再从最终提交生成新的唯一 tarball 并重跑 Windows/Linux
   Node 18/20/22 发布矩阵。push、npm publish、tag/Release、MCP Registry 和外部目录更新
   仍需分别授权；当前没有可发布候选。

## 文档权威

- 当前状态与下一步：本文件。
- 产品和使用方式：`README.md` / `README_zh.md`。
- 架构：`docs/architecture.md`。
- 当前计划：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`。
- 评测方法：`benchmarks/README.md`。
- 历史变更：Git / `CHANGELOG.md`；plan/review/evidence 只作追溯，不复制到本文件。
- 历史发布候选证据：
  `docs/evidence/2026-07-26-release-candidate-a1de485.md`。

## 2026-08-07：三系统双语质量对照的离线准备

- 已新增 30 条预注册常青查询，英文/中文各 15 条，factual、technical、
  navigational 各 10 条；查询合同验证器禁止日期、新闻、新鲜度词、竞品品牌、
  重复规范化查询和非 HTTP(S) 参考来源。
- benchmark capture 的 Provider 清单改为从运行时 engine registry 派生。
  正式 Agent Search profile 固定 9 个零 Key 适配器、`free_only`、waterfall、
  Top-5、无 enrichment/query expansion、10 秒间隔和零重试。
- capture contract v2 记录完整状态、expected/completed 数量、result limit、运行
  配置及其 SHA-256。正式 pooling 使用 `--require-complete`；旧 fixture 仍可回放。
- 竞品控制器的 `--dry-run` 不联网、安装竞品、启动子进程或写入 artifact；未来
  `--execute` 只接受仓库外 driver、固定版本响应、窄环境变量和仓库外私有输出目录，
  并在每次调用后 checkpoint。本轮没有执行 `--execute`。
- AI review/adjudication 已支持哈希校验的断点续跑、固定三个模型快照、384-token
  输出上限、阶段预算、pricing/token/cost 证据和 API 错误 checkpoint。任何 pool、
  prompt、模型、预算、价格或配置漂移都会拒绝 resume。
- 本轮只实现并验证离线与全合成路径；没有调用搜索源、Open-WebSearch、DDGS 或
  OpenAI API，也没有安装竞品。真实 capture 必须等待新的干净出口，并把原始导出、
  normalized capture、pool 和 reviewer artifact 放在仓库外的私有目录。

## 2026-08-07：Search Evidence Packet 离线 Demo

- 新增 `npm run demo:evidence`，使用三个完全合成的冻结场景，通过生产证据评分、
  格式化和 MCP 输出 helper 重放同 family 去重、fallback 失败保留和质量门停止。
- Demo 验证兼容文本视图比 canonical `structuredContent` 更紧凑，同时保留展示 URL、
  provider-family 信号和部分失败类型；JSON 输出使用 `-- --json`。
- fixture 固定 `quality_claim_eligible: false`，脚本不导入引擎、不联网、不启动子进程、
  不调用模型且不写 artifact；它只证明响应合同，不证明搜索质量或实时可用率。

## 2026-08-07：官方 Agent Search Skill

- 新增 `skills/agent-search/`，提供 quick、verify、chinese 和 extract 四条有界路径；
  先检查工具可用性，缺失能力时说明边界，并在安装、连接或修改 MCP 配置前征求同意。
- Skill 只编排现有 `free_search`、`free_search_advanced`、`free_extract`、资源和本地
  doctor，不修改 MCP 工具签名、运行时 Provider 或默认路由阈值。
- npm 文件白名单已纳入 Skill；README 同时保留 MCP 连接步骤和可选 Skill 安装步骤，
  避免把 Skill 安装误写成 Server 已配置。

## 2026-08-07：单查询 live smoke 与预算状态修正

- 用户授权后只执行了两次相互独立的 Wikipedia 单查询 smoke；每次仅一个 Provider
  调用、Top-3、无并发、无 enrichment、无持久缓存、无重试。未复用此前 challenge
  的 DDG/Sogou 出口，也未生成或提交 live fixture。
- 第一条严格 PKCE 查询返回 0 条；第二条较短查询返回 3 条但质量门未通过。该观察只
  证明真实出站与响应合同可运行，不形成搜索质量声明。
- 第二条响应暴露预算误报：精确接纳 3/3 和 `used=551/1200` 的普通片段截断被提升为
  `request_budget` 失败。现在精确填满容量只停止后续工作；仅实际丢弃结果才记
  `result_count` 耗尽，且只有证据字符真正达到上限才记 `evidence_chars` 耗尽。
- 修复后按同一单请求边界复验：仍返回 3 条、`used=551/1200`、
  `truncated_results=2`，但预算为 `exhausted=false`、无 exhaustion reason、无
  `partialFailures`，且质量门仍如实为 insufficient；未继续追加 live 请求。
- 随后用同一查询和两个最小合成结果离线定位相关性问题：Wikipedia 适配器只返回
  通用文章导语，丢弃了 MediaWiki 解释命中的 search snippet。现在显式请求
  `gsrprop=snippet`、移除高亮 HTML，并仅在命中片段缺失时回退文章导语；生产 scorer
  无需改权重，也没有增加 PKCE/OAuth 特例。
- 修复后再执行一次相同的单请求 live 复验：OAuth 以 5/5 查询词命中和 relevance
  0.51 排到第一，HMAC 以 2/5 命中和 relevance 0.40 降到第三，质量门从
  insufficient 变为 sufficient；预算仍无误报。未继续追加请求。
- 同次响应另暴露一个待离线诊断的问题：Sign in with Apple 的普通兼容性说明被标为
  suspicious，且安全警告前缀重复出现。后续应先区分检测误报与展示层重复前缀，不能
  为了消除噪音直接削弱 prompt-injection 门禁。
- 随后按用户要求串行测试另外两个零密钥渠道，每个渠道仍只有一次调用，且两次之间
  间隔 10 秒：Mojeek 返回普通空结果；Wiby 返回 3 条但只有一条直接匹配查询，质量门
  保持 insufficient。两者均无 429、challenge 或 `partialFailures`，未保存原始响应。
- Wiby 响应暴露独立的展示问题：部分标题和片段仍含 HTML entity。后续应在适配器
  边界复用现有解码 helper，而不是调整相关性门槛。
- Baidu 中文单渠道 smoke 的首次 runner 命令因 PowerShell 管道编码把中文变成 `???`，
  该次观察作废；间隔 10 秒后用 Unicode 转义补发一次，确认服务实际收到中文且
  `detected_language=zh`。有效请求返回普通空结果，无 429、challenge 或
  `partialFailures`，未继续请求，也不能据此区分无匹配、页面结构变化或未识别反爬页。
- 离线回归现已把 HTTP 200 验证页及精确的
  `https://wappass.baidu.com/static/captcha...` 重定向分类为 `bot_challenge`；重定向使用
  `manual` 模式，不会产生隐藏的第二次 Provider 请求。普通结果正文引用验证提示不会
  误报，challenge 使用一小时冷却且不自动重试。
- 竞品源码对照后保留了当前的单请求上限：SearXNG 的百度实现同样显式识别 CAPTCHA，
  其维护讨论指出逐条解析百度跳转链接可把一次搜索放大为约 11 次请求；Open-WebSearch
  当前实现则以 HTML selector 和循环分页为主。为遵守本项目限流合同，不跟随每条
  `baidu.com/link`，也不照搬循环分页。SearXNG 使用的 JSON 结果端点只作为后续候选，
  必须先取得本项目自己的许可合规冻结样本和离线解析测试。
- challenge 识别修复阶段没有再次请求百度，因此当时不能反推先前普通空结果的具体
  原因；该原因仍标记为 unknown，而不是已证明的 challenge 或 selector drift。
- 用户同意吸收竞品的可靠性设计后，百度适配器进一步改为单页 JSON 请求
  (`tn=json`, `pn=0`, `ie=utf-8`)；同一响应若仍是 HTML，则继续使用已有 HTML
  parser，不发第二个 fallback 请求。JSON 和 HTML 两条解析路径都只接受外部 HTTP(S)
  URL，继续丢弃 `*.baidu.com` 内部跳转，避免 N+1 解链。
- 离线合同通过后只执行一次直接适配器 live smoke：Top-3、15 秒硬超时、无编排重试、
  无分页、无 enrichment。结果为 3/3 非空 snippet，3/3 同时含 `PKCE` 和 `7636`，
  域名为 `rfc-editor.org`、`cloud.tencent.com`、`developers.line.biz`；未出现 challenge，
  未保存结果原文，也未继续请求。该单查询观察只验证新响应路径可用，不形成质量声明。
- 新路径成功而旧 HTML 路径曾返回空，使 selector/跳转过滤成为更强候选；由于旧响应
  正文未留存且请求参数已经改变，历史空结果的精确根因仍保持 unknown。

## 2026-08-07：全面设计审计与竞品吸收矩阵

- 使用当前源码、测试、合同和固定竞品源码完成产品边界、MCP 输出、Provider 注册、
  adapter、路由、预算、证据、缓存、健康、安全、benchmark、Skill 和发布治理审计；
  结论记录在
  `docs/research/2026-08-07-full-design-audit-and-assimilation.md`。
- 保留 Agent Search 的深合同：provider-family、`partialFailures`、多维质量门、共享预算、
  canonical `structuredContent`、HTTP/SSRF 安全默认值和真实评测门禁。拒绝 count-only
  early stop、challenge 自动重试、隐式系统代理、默认浏览器依赖和自动多付费 fan-out。
- 借鉴 SearXNG 的 processor/adapter 所有权、DDGS 的集中 registry/结果归一化、
  Open-WebSearch 的最小路径 onboarding；Provider Runtime Registry ADR 已接受并实现。
  `provider-catalog.ts` 单独拥有 identity、metadata、credential、family、weight 和
  waterfall phase，`runtime-registry.ts` 单独绑定 executor，避免共享类型导入时初始化
  所有 adapter。
- 本轮低风险修正包括：Wiby 在 adapter 边界解码 HTML entity；formatter 对可疑内容只
  输出一次 canonical warning；HealthTracker 的首个 latency sample 不再被错误除以二；
  工具描述不再把兼容输入上限 12 误写成当前 family 总数。
- `docs/architecture.md` 已补 Wiby 和三个新增可选 API，并校正默认可选阶段只选择
  `PAID_ENGINE_ORDER` 中第一个已配置渠道；`docs/conventions.md` 已明确直接 adapter
  软失败与编排 strict `throwOnError` 的区别。
- 已按单独确认完成 P0：Bing/Yandex 现在复用 shared HTML transport 和失败分类，
  各自保留 provider-specific DOM parser；strict 编排显式保留 `parse_error`、
  `bot_challenge`、HTTP failure、timeout 和取消，直接 adapter 仍保持软失败合同。
  Startpage/Mojeek 尚未迁移。完整离线门禁为 80 个测试文件、798 通过、2 跳过，
  build、lint 和 package manifest 检查通过；未增加 live search、安装竞品、调用模型、
  新依赖、代理来源或公开 MCP 合同。
- Provider registry 定向回归 104/104 通过：16 个 provider 顺序、9/7 access 分组、三段
  waterfall、family JSON 合同和可选凭证均保持；`free-search.ts` 已删除 16 个 adapter
  直引、权重/phase 副本和调用 switch。各 adapter 导出的 metadata 现在是中央 catalog
  投影；未改变路由、spend policy、重试、健康、预算或输出 fixture。
- `search_with_synthesis` 已复用主搜索的 canonical Search Evidence Packet/output schema，
  只增加 `prompt_hint`；不再重新映射并丢失 `partialFailures`、security、provenance 等字段。
  执行元数据新增 `scheduled_adapters` 和 retry-inclusive `adapter_attempts`；由于 adapter
  内部表示链尚无统一请求计数，`http_requests` 如实为 `null`。
- dedup/scorer 的 URL key 已收敛到版本化单 owner。生产仍固定 legacy `v1`；8 组无原文
  合成校准表明 v1 有 4 类已知 false merge，`v2-candidate` 通过合成集，但在 pooled qrels、
  cache migration 和 evidence contract 审查前不启用。
- 最终完整离线门禁：build、lint、82 个测试文件（806 通过、2 跳过）、quality verify、
  30-query validator、competitive dry-run、package check、format/Token regression、exact
  cache 和 intent-routing 全部通过。格式基准因 canonical warning/evidence metadata 的
  预期变化更新为 normal 2396、compact 1650.1、compact aggressive 1633；bootstrap
  quality 仍明确 `quality_claim_eligible: false`。

## 2026-08-07：Bing 可用性 smoke 与 SearchRuntime 所有权

- 在已有 DDG challenge、Yandex challenge 历史下没有复测这两个渠道；只对 Bing 执行一次
  直接 adapter smoke：查询 `AbortSignal cancel fetch MDN`、Top-3、15 秒硬超时、无重试、
  无 enrichment、无 artifact。返回 3 条且 snippet 均非空，无 challenge、429 或错误；但
  三个结果域名为两个百度百科和一个知乎，说明出站链路可用，同时语言/市场上下文仍需独立
  设计和校准。该单查询观察不形成可用率或质量声明，随后停止全部网络测试。
- 架构审计确认 `server.ts` 接收的 config 与 `free-search.ts` 导入时创建的 config/cache/
  health/metrics/rate limiter/policy 可能漂移。新增 `SearchRuntime` 深接口统一拥有这些状态和
  Provider dispatch；工具 registry、三条搜索工具及健康资源现在接收同一 runtime。
- 进程入口只创建一次 runtime，stdio 和每个 HTTP transport server 复用它；CLI 等直接调用
  保留惰性默认 runtime，避免导入时过早读取环境。pending request 按 runtime 使用 WeakMap
  隔离，既保留单 runtime 内请求合并，也禁止相同查询跨 runtime 复用结果。server factory
  只接收 runtime 并从中派生 config，不再允许两份配置同时进入。
- 新增离线测试证明跨 runtime 隔离和 `free_only` dispatch 前拒绝；发布文件清单已显式纳入
  `dist/infrastructure/search-runtime.js`。ADR 见
  `docs/decisions/ADR-20260807-search-runtime-ownership.md`。

## 2026-08-07：P1 双语 SearchRequestContext

- 新增 `engines/search-request-context.ts`，每个逻辑搜索只解析一次 `auto | en | zh`，并将
  同一 `language`、`region`、`Accept-Language` 贯穿 pending collapse、exact cache、重试、
  parallel/waterfall、query expansion 和 Provider dispatch。范围外或不确定语言按当前双语
  产品边界回退英文。
- DDG Web bootstrap 使用官方公开的 `kl=us-en|cn-zh`，不改写页面签发的 preload URL；
  HTML/Lite 沿用已有 `l` 字段并共享上下文。Wikipedia 使用显式语言子域；Bing/Yandex 仅
  调整 `Accept-Language`，没有把 API 市场参数猜成 HTML 合同。
- 直调 adapter 未传上下文时保留旧默认行为；未改变 MCP schema、Provider 集合、family、
  路由顺序、请求数、重试、代理、依赖或 challenge 停止规则。exact cache key 因上游请求
  语义变化升级为 `search-cache-key-v2`，旧缓存自然失效且不迁移。
- ADR 见 `docs/decisions/ADR-20260807-bilingual-search-request-context.md`。本阶段只运行 mock
  HTTP 与离线测试，没有追加 live search。
- P1 检查点门禁：build、lint、84 个测试文件（821 通过、2 跳过）、package manifest、capability
  drift、quality/format benchmark、30-query validator、competitive dry-run、exact cache 和
  intent-routing 全部通过。P1 已提交为 `2d2e7a4`，尚未 push。

## 2026-08-07：P1.5 Provider half-open probe lease

- `HealthTracker.acquireAttempt()` 原子拥有 Provider 尝试准入，并返回幂等 lease；
  `getAvailability()` 只读，不再隐式切换并占用 half-open probe。
- 运行时健康 interface 不再向搜索编排暴露 `recordSuccess()`、`recordFailure()` 或
  `suspend()`。编排层只报告 success、failure、suspended 或 released outcome。
- lease 覆盖一次逻辑 Provider 尝试及其已有重试。`finally` 统一释放取消、预算拒绝、
  限速等待失败和 dispatch 前异常，不把未执行的 Provider 记成成功或失败。
- 离线回归证明 half-open 并发只进入一个 dispatcher；成功关闭 circuit，失败应用现有
  backoff，challenge suspension 保持独立，重复 finish 不会重复计数。
- 完整门禁为 84 个测试文件（831 通过、2 跳过），build、lint、package/capability、
  quality/format、query-set validator、competitive dry-run、exact-cache 和 intent-routing
  全部通过。没有执行 live search、模型调用、push 或发布。

## 2026-08-08：P1.6 受限双语 request-context smoke

- 从当前源码 build 后，通过 runtime dispatcher 对 Wikipedia 串行执行英文、中文各一次
  Top-3 请求；直接 dispatcher 路径没有生产编排重试。
- 英文解析为 `en/us-en`，返回 3 条，延迟 2,485 ms；中文解析为 `zh/cn-zh`，返回
  3 条，延迟 3,931 ms。
- 两次调用间隔至少 10 秒，实际请求数为 2；没有 429、challenge、timeout 或其他失败，
  随后按计划停止联网测试。
- 未保存结果标题、snippet、URL、原始响应或 live fixture，也未调用 DDG、Sogou、Yandex、
  竞品系统或模型。该观察不形成质量、可用率或竞品胜负声明。

## 2026-08-08：P1.3 正式 capture 批准与预检

- 用户已批准 P1.3 的 30-query × 3-system 正式 capture；该批准不包含 AI reviewer、push、
  publish 或公开质量声明。
- 当前源码 build、query-set validator 和 competitive dry-run 均通过：查询集 SHA-256 为
  `9afda7dbb09369ec98bdc7df5a27e41df4fc1747a3a717a2f5f2196398487cf4`，计划为
  90 个 Top-5 样本、Latin-square 顺序、调用间隔 10 秒、零重试。
- 预检没有发现外部竞品驱动、`ddgs` 安装或专用 runner 配置。当前机器所在出口有历史
  DDG challenge，按合同不能作为正式 capture runner；因此本次没有启动正式采集，也没有
  写入 raw、normalized、pool 或 reviewer artifact。
- 后续只在新的干净 runner 上继续。驱动和固定版本安装保留在仓库外；结果内容按“仅限私有
  研究留存、不再分发、不主张内容许可证、遵循上游条款”披露。任何 challenge/429 都在当次
  checkpoint 后终止整轮。
- 用户随后单独批准从当前出口重新测试 DDG。重新 build 后只执行一次直接 adapter 逻辑调用：
  英文常青查询、Top-3、15 秒硬超时、无代理、无编排重试、无 artifact。该调用返回 3 条，
  3 条 snippet 均非空，域名为 `developer.mozilla.org` 和 `jamdesk.com`，耗时 3,383 ms；没有
  challenge、429、timeout 或其他失败。该单点观察只证明当前时点的 DDG 路径可用，不替代
  10-query runner qualification，也不改变正式 capture 仍需受控 runner 的门禁。
