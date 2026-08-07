# Agent Search MCP 全面设计审计与竞品吸收矩阵

日期：2026-08-07
状态：源码审计完成；低风险修正已落地；架构改造保持 proposed

## 结论

Agent Search 的核心方向是成立的：它不应继续与竞品比“引擎更多”，而应把
**可检查的搜索证据合同**做深。当前最有价值的设计是 provider-family 语义、
`partialFailures`、多维质量门、共享预算、MCP `structuredContent` 和安全默认值。

真正需要补强的不是更多 Provider，而是三条内部接缝：

1. 把散落在类型、元数据、调用 switch、权重、瀑布阶段和 family 映射中的 Provider
   事实收进一个运行时注册表；
2. 给 HTML 搜索 adapter 一个共享的传输/失败合同，避免页面漂移或 challenge 被当成
   普通空结果；
3. 统一所有搜索工具的证据输出合同，并区分“计划执行”“adapter 尝试”和“HTTP
   请求”三种工作量。

本轮没有修改 MCP 输入签名、运行时 Provider、路由阈值或依赖，也没有安装或运行
竞品。已落地的修改只修正可独立证明的问题：Wiby 文本实体、安全提示重复、首个
健康延迟样本，以及架构/工具描述漂移。

## 审计范围与证据

审计覆盖：

- 产品定位、MCP/CLI/HTTP/Skill 交付面；
- 工具输入输出、取消、失败与兼容合同；
- Provider 注册、调度、路由、预算、缓存和健康状态；
- HTML/JSON adapter、去重、评分、证据选择、丰富化和安全处理；
- benchmark、外部 capture、AI review、发布门禁和文档治理。

本地事实以 `package.json`、`src/`、`benchmarks/`、`skills/`、`HANDOVER.md` 和测试为准。
竞品只使用官方仓库、官方文档和固定源码：

- [Open-WebSearch `searchService.ts`](https://github.com/Aas-ee/open-webSearch/blob/3f36330dfba873d66c52116d8c8334aaf65137f4/src/core/search/searchService.ts)
- [DDGS 9.14.4 `ddgs.py`](https://github.com/deedy5/ddgs/blob/a4bf2f21827dc632296008068c5da00960f3cd05/ddgs/ddgs.py)
- [DDGS 9.14.4 `results.py`](https://github.com/deedy5/ddgs/blob/a4bf2f21827dc632296008068c5da00960f3cd05/ddgs/results.py)
- [SearXNG online processor](https://github.com/searxng/searxng/blob/master/searx/search/processors/online.py)
- [SearXNG abstract processor](https://github.com/searxng/searxng/blob/master/searx/search/processors/abstract.py)
- [SearXNG result container](https://github.com/searxng/searxng/blob/master/searx/results.py)
- [MCP tool result specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

调研只比较可见的产品边界与实现，不推断不可见的索引质量，也不把 GitHub stars、
官网自述或单次 live query 当作质量结论。竞品格局和分发快照另见
[竞品格局与差异化机会](./2026-08-07-competitive-landscape-and-product-gaps.md)。

## 总体评分

| 设计面 | 当前判断 | 最重要的证据 | 决策 |
|---|---|---|---|
| 产品边界 | 强 | 免费优先、本地优先、中文来源和证据合同能形成一致产品 | 保留并收窄表述 |
| MCP 主搜索合同 | 强 | `free_search*` 有 output schema、文本兼容视图和 canonical `structuredContent` | 保留 |
| Synthesis 工具合同 | 强 | `search_with_synthesis` 复用 canonical packet/output schema，只增加 `prompt_hint` | 已收敛 |
| Provider 注册与调用 | 强 | 静态 catalog 与 runtime executor registry 已替换 switch/weight/phase/family 副本 | ADR 已接受并实现 |
| Adapter 失败语义 | 中强 | DDG/Sogou/Baidu/JSON API 已较深；Bing/Yandex 已迁入共享 HTML 失败合同，Startpage/Mojeek 仍是遗留边界 | P0 完成，后两者延后 |
| 路由与停止 | 强 | 数量、逐条 relevance、confidence、family coverage 分开判断 | 保留并校准 |
| 预算 | 强 | 三层预算分离；调度、attempt 与未知 HTTP 请求数已显式区分 | 保留 |
| 去重与 provenance | 强但有受控遗留 | family-aware corroboration 正确；URL 已版本化，v2 候选通过合成集但未切生产 | 等 pooled qrels |
| 缓存 | 中强 | key 绑定策略、输出和 freshness；不缓存空/预算耗尽结果 | 保留，减少遗留 API |
| 健康/冷却 | 中强 | challenge 立即暂停并可持久化；generic circuit 有界 | 修正指标，补 half-open 并发测试 |
| 安全/提取 | 强 | HTTP 默认认证、Origin allowlist、SSRF/redirect/内容预算 | 保留并做误报校准 |
| Benchmark | 强准备、无胜负结论 | 30 条双语合同、断点续跑、预算与私有 artifact 边界已具备 | 继续真实 capture |
| Onboarding | 中强 | README、`fasm doctor`、capabilities/health Resource 和 Skill 已连通 | 保留最小路径 |
| 发布治理 | 强 | package/registry/worktree 门禁分开，外部动作仍需授权 | 保留 |

## 从竞品吸收什么

### 1. SearXNG：共享执行器拥有传输和失败语义

SearXNG 让 engine 负责生成请求和解析响应，让 shared processor 负责 timeout、HTTP、
统计、异常分类和 suspension。CAPTCHA、429 和 access denied 有不同异常与暂停时间；
结果容器独立处理归一化、合并、排序、timing 和 unresponsive engine。

值得吸收的是**所有权边界**，不是 AGPL 源码：

- adapter 描述 provider-specific request/parse；
- shared transport 描述 timeout、HTTP、challenge、Retry-After 和取消；
- orchestrator 描述策略、重试、预算和 agent-facing failure；
- result/evidence layer 描述去重、family 和质量门。

当前 DDG/Sogou/Baidu/JSON API 已接近这个边界；Bing/Yandex 已作为两个真实调用者
复用 shared HTML transport/failure seam，同时保留各自 DOM parser。Startpage/Mojeek
仍保持原实现，等共享接口稳定后再评估迁移。没有扩大代理环境变量；当前显式代理合同
仍只属于 DDG/Sogou。

### 2. DDGS：集中注册、provider-aware 调度和结果归一化

DDGS 把 engine class、provider、priority 和类别集中注册，由统一 executor 创建实例、
按 provider 去重调度，再由 `ResultsAggregator` 归一化结果、URL 去重、保留更长正文并
按跨引擎出现次数排序。

值得吸收：

- 一个 descriptor 同时拥有 metadata、executor 和调度属性；
- adapter 输出在进入聚合前完成归一化；
- 同 provider 不因多个 adapter 而虚增并发或 corroboration。

不吸收：

- 唯一结果数达到目标就停止；
- 只写日志而不把逐 Provider 失败交给调用方；
- 把跨 Provider 出现频次当作足够的相关性/真值代理。

Agent Search 已经比 DDGS 多一层 evidence semantics，因此注册表重构必须保留
`partialFailures`、provider-family 和多维质量门，不能退化成单纯 executor map。

### 3. Open-WebSearch：小执行面和清晰的 Agent onboarding

Open-WebSearch 的 search service 很小：均分 limit、并行执行、汇总
`partialFailures`、截断结果。它的 Skill 明确区分 MCP、CLI、daemon 和 Skill，并先
检测可用路径再做安装/启动。

值得吸收的是交付表达：

- Skill 只负责选择最小路径，不把 planner 塞进 runtime；
- MCP、CLI、daemon 的用途分开解释；
- 用户先看到一条能运行的路径，再看到扩展能力。

本仓库现有 `skills/agent-search/SKILL.md`、`fasm doctor` 和 Evidence Demo 已经完成这
一轮吸收。Open-WebSearch 的数量截断、粗粒度 `engine_error` 和无去重聚合不适合作为
Agent Search 的内部合同。

### 4. MCP 官方规范：一个 canonical 结构，文本只做兼容视图

MCP 工具规范允许 `outputSchema` 和 `structuredContent`，并建议同时返回序列化文本以
兼容旧客户端。`free_search` 和 `free_search_advanced` 已按这个模型实现；文本输出是
紧凑视图，完整 evidence packet 只维护一份。

`search_with_synthesis` 是例外：它重新映射结果并只返回文本 JSON，没有 output schema，
也没有保留 `partialFailures`、security 和完整 provenance。修复会改变公开工具输出，
需要单独批准。短期继续在 Skill 中默认不启用该工具。

## 内部设计审计

### A. Provider 注册表与模块深度

审计时 Provider 事实至少分布在：

- `src/types.ts` 的 `SEARCH_PROVIDERS`；
- `src/engines/index.ts` 的 metadata/credential registry；
- `src/tools/free-search.ts` 的调用 switch、权重和 waterfall phase；
- `src/aggregation/dedup.ts` 的 family 映射；
- `docs/contracts/provider-families-v1.json` 的机器合同；
- 配置、能力矩阵和发布元数据派生路径。

当时的 parity 测试能发现部分漂移，但不能消除多处修改成本。`free-search.ts` 同时拥有
adapter invocation、重试、健康、限流、预算、缓存、parallel/waterfall、evidence 和
工具注册，是当前最明显的浅模块集群。

现已按 ADR 采用 replace-not-layer：`provider-catalog.ts` 单独拥有静态事实，
`runtime-registry.ts` 单独绑定 executor；编排层的 switch、权重和 phase 副本以及 dedup
的 family 副本均已删除。静态/执行注册表分开可避免类型或 schema 导入时初始化所有
adapter。public contract JSON 继续独立版本化，并由 parity test 校验 catalog 投影。

### B. Adapter 和传输

当前 adapter 分三档：

1. DDG/Sogou：有专门表示链、challenge 语义、取消和显式代理；
2. Baidu/JSON API：有 typed error、schema/parse 检查和无自动重试边界；
3. Bing/Yandex：共享传输和失败分类 + provider-specific DOM parser；Startpage/Mojeek
   仍为 regex HTML parser + bare fetch，成功页面无已知结果 surface 时可能返回 `[]`。

第三档会把“真实零结果”和“页面漂移/challenge”混为一谈，破坏 `partialFailures` 的
可信度。Startpage 还需要 token + search 两个 HTTP 请求，而执行预算记录的是一次
adapter 尝试。后者不是错误，但必须明确 adapter attempt 与 network request 不同。

HTML seam 的验收条件：

- typed `parse_error` / `bot_challenge` / HTTP failure；
- challenge 页面不能继续切换表示或自动重试；
- 有搜索 surface 时，普通结果中出现 captcha 文本不能误判；
- 保留调用方取消和统一 deadline；
- 先由 Bing/Yandex 两个 adapter 真实使用；
- mock-only 测试，不在日常测试访问网络。

### C. 路由、质量门和可选费用

当前路由的正确设计应保留：

- explicit engine selection 是权威输入；
- same-family adapter 只做顺序 fallback；
- `free_first` / `free_only` 不因存在 API key 自动花费；
- `quality_escalation` / `paid_first` 只选择 `PAID_ENGINE_ORDER` 中第一个已配置渠道；
- 结果数、逐条 relevance、平均 confidence 和 family coverage 分开过门；
- semantic 开启时依据 post-semantic display basket 停止。

权重、phase 和 executor 的 owner 已由 registry 修复；剩余主要债务是 config、cache、
health、metrics 和 rate limiter 仍在模块导入时创建单例。单例使同一进程中难以
建立隔离的 router instance，也使配置重载和组件级测试更重。建议未来构造
`SearchRuntime`，一次注入 immutable config 和状态 owner；不要增加全局 service locator。

### D. 预算与执行遥测

四个 budget dimension 有清楚含义：adapter attempts、elapsed time、admitted raw results
和 evidence characters。问题在 response-level telemetry：

- `searched_engines` 是调度列表，可能包含被 policy/health 拒绝、没有发出网络请求的
  adapter；
- `meta.execution.engine_calls` 当前更接近调度次数；
- `meta.execution.budget.observed.engine_calls` 是含 retry 的 adapter attempts；
- 一个 adapter attempt 可能产生多个 HTTP 请求。

现已在不删除兼容字段的前提下增加 `scheduled_adapters` 和 `adapter_attempts`：前者是
进入路由计划的 adapter identity 数，后者来自请求预算并包含 retry。由于 adapter 内部
表示链尚未统一上报，`http_requests` 明确输出 `null`，没有使用调度次数伪造精确值。

### E. 去重、评分和证据语义

provider-family 是当前最深的差异，必须保留。DDG/Bing 和 Startpage/Serper 不能通过
adapter 数量增加 `source_count`。正文提取也不能增加 confidence 或 family count。

需要校准的边界：

- 生产 `v1` 仍删除全部 query 参数，会错误合并依赖 query 标识资源的 URL；
- 标题 Jaccard 是简单启发式，大小写、标点和中文分词边界较弱；
- relevance floor 仍是内部 heuristic，不是 truth label；
- `min_confidence` 的 2-3 legacy 含义把 confidence 与 source count 混在同一输入。

URL 规范化已收敛为 dedup/scorer 共用的版本化 owner，并建立 8 组无原文合成校准：
tracking、query 顺序、fragment 等同一性，以及 identity/pagination/language query 和
大小写敏感路径差异。校准明确记录生产 v1 的 4 类 false merge；`v2-candidate` 通过该
合成集，但仍等待真实 pooled qrels、cache migration 和 evidence contract 审查，未切换
生产版本。

### F. 缓存、健康和状态

缓存 key 已绑定请求、路由、semantic、输出、policy、TTL 和 evidence contract，且不会把
空结果或预算耗尽响应作为普通成功长期缓存。这比只用 `query + count + engines` 的旧
`SearchCache.makeKey()` 更可靠；旧方法当前只剩测试/兼容价值，应在下一次破坏性清理时
删除，而不是形成第二套 key 规则。

健康层正确地区分 generic circuit 与 provider-declared cooldown，challenge 可立即暂停并
持久化。本轮修复了首个成功样本被除以二的问题。仍需补一个并发测试：代码声明了
half-open 只允许一个 probe，但当前状态没有明确的 in-flight probe lease；在证明取消、
预算拒绝和并发完成都能释放 lease 前，不应仓促加锁。

### G. 安全和提取

保留当前边界：HTTP 默认认证、Origin allowlist、SSRF/IP 校验、redirect 限制、内容长度
预算、结果文本视为 untrusted data。安全检测的 threat metadata 与可见警告是两个不同
职责。本轮修复了 formatter 在 detector 已加标记后再加第二次标记的问题。

后续需用独立 fixture 校准误报/漏报，尤其是正常登录、OAuth、系统提示词研究页面。
在没有原始 snippet 证据前，不应为了降低误报而删除 pattern。输出边界 marker 当前是
遗留 helper；若没有真实调用者，应在破坏性清理中删除或由 canonical formatter 拥有，
不要形成第三种警告格式。

### H. Benchmark、AI review 与发布

离线套件已经具备正确的证据治理：30 条预注册双语常青查询、三系统身份、完整 capture
门禁、外部原文私有、blind pool、双 family 独立评审、第三 family 只裁决分歧、预算和
resume hash。它比竞品功能表更接近可发布的质量证据。

当前限制必须继续公开：未完成真实多系统 capture、完整裁决和 relevance calibration，
因此没有搜索质量胜负结论。`quality_claim_eligible` 也不是发布授权。不要为追赶产品营销
而降低完整 capture、零结果保留、许可证和私有 artifact 门禁。

### I. 文档、Skill 和分发

README 首屏、Evidence Demo、Skill、doctor、capabilities/health Resource 已形成一条比旧版
更清楚的 onboarding。借鉴 Open-WebSearch 的价值已经被吸收：Skill 选择最小工作路径，
但不替代 MCP runtime。

仍需防止生成事实与手写事实分叉：adapter 数量由 registry 派生，family 数量由版本化
合同派生，价格/stars/Registry 状态只能写在带日期的 research/evidence 文档。本轮发现
family 合同有 13 个唯一值，而工具输入仍因兼容 capped at 12；正确文案是“输入合同上限
12”，不是“当前最多 12 个 family”。

## 已吸收、暂缓与拒绝矩阵

| 外部设计 | 决策 | 本仓库落点/理由 |
|---|---|---|
| SearXNG shared online processor | 吸收设计，分阶段实现 | 先统一 Bing/Yandex transport/error seam |
| SearXNG typed suspension | 已吸收 | `EngineAdapterError` + `HealthTracker.suspend` + cooldown store |
| SearXNG unresponsive engine/timing | 部分吸收 | `partialFailures` 更适合 Agent；timing 仍需精确语义 |
| DDGS provider-aware scheduling | 已吸收并深化 | same-family chain + provider-family corroboration |
| DDGS central engine registry | 已吸收并深化 | 静态 catalog + 无副作用 runtime executor registry，见已接受 ADR |
| DDGS result normalization | 继续吸收 | 本轮补 Wiby entity decode；HTML seam 后继续统一 |
| DDGS count-only stop | 拒绝 | 保留多维 evidence gate |
| Open-WebSearch 小 search service | 吸收目标，不照搬行为 | 拆小 `free-search.ts`，但保留深 evidence contract |
| Open-WebSearch Skill/onboarding | 已吸收 | repository Skill + doctor + smallest-path guidance |
| 浏览器/Playwright 默认后备 | 拒绝默认集成 | 依赖、合规、可审计性和 challenge 边界不匹配 |
| 自动重试 challenge/429 | 拒绝 | checkpoint/cooldown/fallback，不做绕过 |
| 隐式系统代理 | 拒绝 | 只读显式、受控、可脱敏配置 |
| 所有已配置付费 API 自动 fan-out | 拒绝 | 显式 spend policy + first configured optional |
| MCP output schema + structured content | 已吸收 | 主搜索工具保持 canonical packet + 文本兼容视图 |
| 广工具面（新闻/图片/crawl/agent） | 暂缓 | 需要采用或评测证据，不能削弱核心深度 |

## 优先级与授权门

### 已完成（本轮）

- Wiby `Title`/`Snippet` HTML entity 解码；
- security formatter 只渲染一次 canonical injection warning；
- HealthTracker 首个 latency sample 不再错误减半；
- family 数量文案、架构 Provider 清单、可选 API 策略和错误处理规范校正。

### P0：已按单独确认完成

1. Bing/Yandex 已使用 shared HTML transport/failure seam，各自保留 DOM parser；
2. `throwOnError: true` 下，已知搜索 surface 无可解析结果返回 `parse_error`；
3. challenge、429、403、5xx、取消、普通零结果和 query 含 challenge 词均有 mock
   回归；
4. 定向测试 23/23 通过；完整离线测试 798 通过、2 跳过，build、lint 和 package
   manifest 检查通过。

这项工作没有增加网络调用、重试、分页、代理来源、生产依赖或公开 MCP 合同。

### P1：已批准，分阶段实施

1. Provider catalog/runtime registry 已替换 switch/weight/phase/family 的分散事实；
2. `search_with_synthesis` 已复用 canonical evidence packet 并只添加 `prompt_hint`；
3. 已增加 `scheduled_adapters` / `adapter_attempts`，`http_requests` 在未统一埋点前为 null；
4. 可注入 `SearchRuntime` 尚未实施；它需要单独迁移 config/cache/health/metrics/rate limiter，
   不在本轮 registry/output 重构中增加半成品 service locator；
5. URL canonicalization 已版本化并通过合成校准；切换 v2 仍等待 pooled qrels。

本轮最终门禁为 build、lint、82 个测试文件（806 通过、2 跳过）、quality verify、
30-query validator、competitive dry-run、package check、format/Token regression、exact
cache 和 intent-routing 全部通过。所有新增测试和 fixture 均离线；没有执行 live search、
竞品进程、模型调用、安装、发布、提交或推送。

### P2：真实需求出现后再做

- 新闻、图片、视频、crawl/map/interact；
- Chromium/Playwright runtime；
- 内置 LLM planner 或深度研究 Agent；
- 匿名托管 remote MCP；
- 多付费 Provider 自动并发。

## 完成判据

设计吸收不是“增加一个 abstraction”就完成。每一项必须满足：

- 至少两个真实调用者，或一个明确需要隔离的变化轴；
- 旧实现被替换，不保留双 owner；
- adapter failure、取消、预算和 provenance 仍可通过公共接口观察；
- mock 单元测试和完整离线门禁通过；
- live evidence 与日常测试隔离；
- 没有未经许可的源码复制、依赖增加、Provider 增加或公开合同变化。
