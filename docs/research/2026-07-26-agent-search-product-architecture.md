# Agent Search 产品架构与代码实现调查

日期：2026-07-26

## 调查目标

这不是按官网功能表做横向打分，而是检查当前官方仓库中的真实代码：

1. 搜索请求由谁规划，何时并行、何时继续、何时停止；
2. 相关性、来源可靠性、多源印证是否混成一个分数；
3. 如何控制正文、摘要和工具定义的 Token；
4. 如何暴露引用、失败、限流和重试证据；
5. 哪些能力应该留在 MCP 检索核心，哪些应该属于上层 Search Agent。

结论基于固定 commit 的源码快照。托管服务内部排名算法不可见，因此本文只评价公开的 MCP/Agent 实现，不把产品宣传当成代码事实。

## 先给结论

Agent Search MCP 最适合成为一个**本地优先、证据优先、Token 有预算的搜索策略层**，而不是在 MCP Server 内再嵌入一个必须调用 LLM 的深度研究 Agent。

推荐边界：

```text
Search Agent
  ├─ 澄清问题、拆分研究角度、安排并行任务、决定是否继续
  └─ 根据结构化证据写答案和引用
          │
          ▼
Agent Search MCP
  ├─ 查询分类与引擎策略
  ├─ 分阶段搜索、健康状态、限流、缓存和取消
  ├─ 去重、相关性、来源可靠性、多源印证
  └─ Passage/Token 预算、失败证据、结构化结果
          │
          ▼
Slim Guard
  ├─ 权限与策略
  ├─ 内容安全和提示注入处理
  └─ 可逆压缩、审计与跨 MCP 统一治理
```

这里的关键不是多一个总分，而是让上层 Agent 看见“为什么停止、哪些来源彼此独立、哪些调用失败、哪些内容被压缩”。

## 三类产品的本质区别

| 类型 | 代表产品 | 公开实现的主要职责 | 适合借鉴 | 不应误学 |
|---|---|---|---|---|
| 托管搜索 API 的 MCP 适配器 | Tavily、Exa、Brave、Firecrawl | 参数校验、调用单一托管服务、格式化结果 | 结果预算、结构化错误、专用上下文接口 | 把单一上游分数当成已验证相关性 |
| 多引擎聚合器 | SearXNG、DDGS | Provider 选择、并发、去重、健康和失败隔离 | 独立 Provider、暂停/熔断、交叉出现信号 | 仅因“数量够了”就停止 |
| 深度研究 Agent | Vane、GPT Researcher、Open Deep Research、Jina node-DeepResearch | 问题分解、多轮搜索、压缩上下文、写报告 | 有界循环、状态图、按角度并行 | 把 LLM 循环塞入基础 MCP 搜索路径 |

## 托管搜索 MCP：真实代码模式

### Tavily MCP

源码快照：[`259bfd2`](https://github.com/tavily-ai/tavily-mcp/tree/259bfd205de90d74a131e9d2b29cb69ebe11feb7)。该快照的 `package.json` 声明 MIT，但仓库根目录没有随快照提交 LICENSE 正文；这里记录的是包元数据，不把它扩写成更强的许可结论。

- 它是一个薄适配器：`tavily_search` 最终只调用一次 Tavily Search API，本地没有多引擎路由、去重或提前停止。
- 搜索输入暴露 `basic`、`advanced`、`fast`、`ultra-fast` 深度以及日期、国家、域名等过滤项。这个设计把“成本/延迟档位”变成显式策略，而不是隐含在一个布尔开关里。
- API 结果包含 `score`，但默认 MCP 文本格式只输出标题、URL 和内容，没有把上游分数传给调用方。说明“服务内部有分数”不等于“Agent 获得可审计相关性证据”。
- `tavily_extract` 接受 `query` 来对正文片段重排。这个模式比返回整页正文更适合 Agent Search：先检索，再按当前问题选 passage。
- Research 接口使用指数退避轮询，并分别限制总时长、流首包、空闲和完整性；流中途结束会失败，而不是把残缺结果伪装成成功。
- 最新本地 stdio 代码在没有 `TAVILY_API_KEY` 时发送
  `X-Tavily-Access-Mode: keyless`；Search/Extract 有受限入口，其他能力仍要求密钥。相关实现见
  [`src/index.ts#L97-L110`](https://github.com/tavily-ai/tavily-mcp/blob/259bfd205de90d74a131e9d2b29cb69ebe11feb7/src/index.ts#L97-L110)。
  官方远端文档的不带 key 路径则走 OAuth，不能把本地 keyless 和远端匿名访问混为一谈。

可吸收：

- 把速度、成本和内容深度做成明确的搜索策略档位；
- Extract 接收查询并只返回相关 passage；
- 长任务分别限制排队、首包、空闲和总时长。

不照搬：

- 不把托管 API 的内部 `score` 直接当作跨引擎通用相关性；
- 不让本地格式化阶段丢掉来源、失败和分数含义。

### Exa MCP

源码快照：[`b407605`](https://github.com/exa-labs/exa-mcp-server/tree/b4076055af28698d944b50deade80e541b7788ea)，MIT。

- 默认搜索是单次 Exa 请求，使用 `type: auto` 和 highlights；工具描述鼓励写“理想页面是什么样”的语义查询，而不是只堆关键词。
- 默认输出保留标题、URL、作者、时间和 highlights，但省略 API 的 `score`；高级工具保留清洗后的结构化数据和 score。它实际上区分了“Agent 日常消费格式”和“诊断/高级格式”。
- 高级搜索可分别限制全文、上下文、highlight、summary 和 subpage 字符数。这比结果级统一截断更精细，也更适合 Token 预算。
- 错误处理只对 500/502/503/504 做两次指数退避；429 会给出明确恢复建议。当前 `withTimeout` 只竞争 Promise，没有中止底层请求，Agent Search 已有的 AbortSignal 传播应保留。
- 官方托管地址可直接连接；代码对未提供用户 API key 的 429 明确返回 “free MCP rate limit”。因此 Exa 具有**受限的托管 keyless 入口**，不能再写成“任何使用都必须账号/API key”。本地 npm Server 和自带额度则是另一条路径。
- 在配置 Upstash/KV limiter 时，托管代码的默认参数是 2 QPS、50 次/日；部署环境可覆盖，未配置 limiter 时这层限流会禁用。它只能证明存在受限 free path，不能当作线上固定配额。
- 官方 Search Skill 对复杂问题要求按不同角度而非同义词展开查询，并把大量原始结果压缩在主上下文之外。它还明确提醒：语义相似不等于已经验证的相关性，仍需检查标题和摘要。

可吸收：

- 普通格式与高级诊断格式分离；
- passage/highlight 级预算；
- 只重试真正可能恢复的状态；
- 上层 Agent 按研究角度展开查询，MCP 核心保持确定性。

不照搬：

- Promise 超时但不取消底层网络请求；
- 用长工具描述代替可观察的搜索策略元数据。

### Brave Search MCP

源码快照：[`76106c8`](https://github.com/brave/brave-search-mcp-server/tree/76106c83f9d57319478b540374ba261061d26c3e)，MIT。

- Web Search 暴露国家、语言、freshness、结果类型、额外摘要和 `goggles` 自定义重排；本地仍是单上游调用。
- `brave_llm_context` 返回面向 LLM 的相关片段，并同时提供 MCP
  `structuredContent`、输出 schema 和 source map。这是 Agent Search 稳定版最值得补齐的协议模式。
- HTTP 入口检查 Host/Origin 以降低 DNS rebinding 风险。
- 当前通用请求函数没有完整的 timeout/retry/self-throttling；代码中仍留有 rate-limit TODO。因此不能因品牌索引质量而假设 MCP 适配层的运行语义已经完整。

可吸收：

- 文本展示与 `structuredContent` 同时返回；
- source map 与上下文片段保持机器可读关联；
- 自定义重排规则作为高级策略，而不是修改基础工具签名。

不照搬：

- 把上游限流和超时留给调用者猜测；
- 为每种垂直搜索都注册一个默认可见工具，增加工具选择和描述 Token。

### Firecrawl MCP

源码快照：[`7232b6d`](https://github.com/firecrawl/firecrawl-mcp-server/tree/7232b6d1cdd80335107d53a33b80c902b515a334)，MIT。

- Full surface 很大，但另有严格的 search-only profile，仅暴露只读搜索/研究能力。这个模式适合 Slim Guard：按能力建立安全面，而不是让所有工具默认可见。
- 普通 Web Search 仍是一轮上游请求；推荐流程是先 Search，再抓取少量选中页面，而不是首轮就抓全文。
- 结果保留 `id` 和 `creditsUsed`，便于把结果、反馈和成本关联起来。反馈本身是外部写操作，不能由 Agent 自动提交。
- SDK/BYOK 路径有认证和重试；keyless 路径是直接 `fetch`，未见完整 timeout/retry。
- 当前源码的 hosted full-surface keyless allowlist 是 Search、Scrape、Parse，并在 eligibility 失败后关闭；README 仍写 Search、Scrape、Interact。独立 search-only endpoint 每次请求都要求认证。这说明免费能力必须从注册代码和测试生成，不能只维护一张手写表。

可吸收：

- search-only 安全面；
- Search-first、Fetch-later；
- 结果 ID、预算/成本和失败关联；
- 从真实注册表生成能力文档。

不照搬：

- keyless 裸 `fetch`；
- 自动提交会影响外部质量或退款数据的反馈；
- 把免费面只写在 README，允许文档和代码漂移。

## 多引擎聚合：真实代码模式

### DDGS

源码快照：[`a12929a`](https://github.com/deedy5/ddgs/tree/a12929a72429a39a0841c3d7caacb20ee17acd4d)，MIT。

- `_search_sync` 先选择独立 provider，再按请求数量决定 worker 数，并行调用多个上游。
- 聚合器按 URL 去重，保留更长摘要，并把同一 URL 在多个 provider 中重复出现的次数用于排序。
- 它在唯一结果数达到目标后停止；这个条件节省调用，但没有证明结果与查询相关。
- `SimpleFilterRanker` 使用标题/正文中的查询词做分桶，而不是训练出的统一概率。
- 当前 DuckDuckGo 实现只使用 HTML 端点，并把其 provider 标成 `bing`，防止把 DDG 和 Bing 当成两个独立印证来源。它还使用随机 User-Agent 和专用
  `HttpClient2`；本项目保留 provider-family 判断，但不复制身份/指纹轮换行为。见
  [`ddgs/engines/duckduckgo.py`](https://github.com/deedy5/ddgs/blob/a12929a72429a39a0841c3d7caacb20ee17acd4d/ddgs/engines/duckduckgo.py)。

对 Agent Search 的直接含义：

1. `source_count` 必须统计独立上游，而不只是 adapter 名称；
2. 结果数只能作为必要条件，不能单独触发瀑布停止；
3. 相关性、来源可靠性、多源出现次数要保持分离。

### SearXNG

源码快照：[`0909dbc`](https://github.com/searxng/searxng/tree/0909dbc9efb2c6e93e2ad51e60e66417ab291710)，AGPL-3.0-or-later。这里只借鉴架构思想，不复制其实现。

- 它把引擎适配、网络配置、结果类型、错误分类和调度分开，并可对 CAPTCHA、429、403 等错误采用不同暂停时间。标准搜索是所有未暂停引擎并发并共享一个墙钟 deadline，不是质量瀑布。
- 可靠性重点是跨请求暂停而非请求内重试；网络重试默认是 0。
- 当前通用 DuckDuckGo Web 引擎先从搜索页提取服务端生成的
  `links.duckduckgo.com/d.js` URL，再请求 JSON；查询、服务端 token 与
  User-Agent 绑定，所以同一会话保持静态 UA，并带浏览器 `Sec-Fetch-*` 头。见
  [`duckduckgo_web.py`](https://github.com/searxng/searxng/blob/0909dbc9efb2c6e93e2ad51e60e66417ab291710/searx/engines/duckduckgo_web.py)。
- Sogou 引擎禁用自动 redirect，把指向 `/antispider/` 的 302 明确转换为
  CAPTCHA，而不是继续抓 challenge 页面。见
  [`sogou.py`](https://github.com/searxng/searxng/blob/0909dbc9efb2c6e93e2ad51e60e66417ab291710/searx/engines/sogou.py)。
- 本 runner 的受控探测显示 DDG HTML/Lite 都返回 HTTP 202 challenge，但
  页面签发的 Web preload 非空；Sogou 即使延续 cookie 仍进入 `/antispider/`。
  这些事实只代表当前出口，边界记录见
  [`DDG HTML/Lite network observation`](../evidence/2026-07-26-ddg-html-lite-network-observation.md)。

对 C2 的修正：

- Lite 可以作为**机会性兼容路径**，不能宣传为更宽松或可靠的 rate-limit 回退；
- CAPTCHA/202 应进入明确的 `bot_challenge` 失败证据和 provider 冷却；
- 不应通过轮换身份或反复切端点来规避上游限制；
- 若没有跨网络 runner 的成功 fixture，不把 C2 标记成“DDG 可用率提升”。

### MCP Web Hound

源码快照：
[`f468da9`](https://github.com/ilgizar-valiullin/mcp-web-hound/tree/f468da9943952fddc1ed71ca977b18b60f40ca11)，
MIT；npm `1.10.16`。以下结论来自该固定快照和 npm/GitHub 在
2026-07-26 的一次性指标，不把短期 Star 或下载量当成质量证明。

#### 基础数据校正

| 指标 | agent-search-mcp | mcp-web-hound | 说明 |
|---|---:|---:|---|
| 首个 Git commit | 2026-06-22 | 2026-06-26 | 后者不是 6 月 25 日发布；其 npm 包更晚 |
| npm 首次发布 | 2026-06-23 | 2026-06-29 | `npm view <pkg> time` |
| 当前 npm 版本 | `3.1.3`（7 月 23 日） | `1.10.16`（7 月 4 日） | 版本号不能横向代表成熟度 |
| 已发布 npm 版本数 | 10 | 25 | Web Hound 在约 6 天内连续发布 25 个版本 |
| GitHub Star / Fork | 15 / 1 | 19 / 2 | 极小、易波动样本，只能看分发触达 |
| npm 下载（7 月 18–24 日） | 900 | 159 | 5.66 倍下载，不等于 5.66 倍独立用户 |
| Node / License | >=18 / Apache-2.0 | >=20 / MIT | Web Hound 使用原生 SQLite/vector 依赖 |

下载窗口可由 npm 的
[`agent-search-mcp`](https://api.npmjs.org/downloads/point/last-week/agent-search-mcp)
和
[`mcp-web-hound`](https://api.npmjs.org/downloads/point/last-week/mcp-web-hound)
端点复核。Star/Fork 是 2026-07-26 快照，不进入长期 README 结论。

因此，“晚 3 天却多 4 个 Star”最多是一个分发线索，不能推出命名、捐赠地址或
文档中的任何一个因素是原因。钱包地址也不能证明长期维护承诺。更可靠的判断是：
Web Hound 用短名称、单参数 `web_search`、配置 CLI、状态工具和多篇专题文档，
让新访客更快形成“工程完整”的心智模型；Agent Search 的 npm 下载明显更高，
说明包被拉取更多，但下载包含 CI、重复安装和自动化流量，不能直接称为用户数。

#### 真实运行时，不是 README 印象

| 公开印象 | 固定源码事实 | 对 Agent Search 的含义 |
|---|---|---|
| “8 provider 并行路由” | 默认 `MAX_PARALLEL_PROVIDERS=2`；每个槽位遇到第一个非空 provider 就退出，最多聚合两个成功 provider。见 [`provider-router.ts#L70-L167`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/search/provider-router.ts#L70-L167) | 不用 adapter 总数描述单次搜索；继续公开实际阶段、调用数和停止原因 |
| “Intent-aware routing” | NLI 分类器真实存在，但 router 不依据 `intent` 选 provider；intent 当前主要进入 cache key/TTL，freshness 进入重排。见 [`intent-classifier.ts#L55-L123`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/search/intent-classifier.ts#L55-L123) 与 [`orchestrator.ts#L65-L86`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/search/orchestrator.ts#L65-L86) | “分类器存在”不等于“分类改善路由”；必须用 routing slice benchmark 验证 |
| “Semantic cache + reranker” | SQLite exact cache、sqlite-vec 相似查询缓存和本地 NLI 重排都是真实现；默认需要约 240MB 模型和原生/可选依赖。生产依赖和可选依赖大量使用 `latest`。见 [`package.json#L47-L70`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/package.json#L47-L70) | 持久缓存值得实验，但不能牺牲 Node 18、可复现安装或零额外依赖的默认路径 |
| “Budget Manager” | 当前是单进程固定窗口的 search/fetch 计数，不是 task/session budget；没有 fetch 工具消费 fetch 预算。预算拒绝在 orchestrator 中返回无错误说明的空结果。见 [`budget-manager.ts#L12-L104`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/limits/budget-manager.ts#L12-L104) 与 [`orchestrator.ts#L74-L89`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/search/orchestrator.ts#L74-L89) | 吸收“预算是一等公民”，不复制把拒绝伪装成零结果或把进程窗口称为 task 的语义 |
| “Incremental backoff” | 分 provider 的分钟/日/月计数会持久化；连续失败的 1 分钟到 24 小时级别在内存累计。未知错误默认归为 `access_denied`，成功会清空 suspension。 | 若持久化冷却，必须区分 CAPTCHA、429、403、timeout、parse drift，并把 skip/failure 返回给 Agent |
| “Status 工具” | 状态、缓存和预算可见性很好；但 `config_help` 把所有配置原值写进响应，包含描述过的 API Key/Token。见 [`status.ts#L24-L39`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/tools/status.ts#L24-L39) 和 [`types.ts#L243-L261`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/utils/types.ts#L243-L261) | 保留 Agent Search 的 resource/HTTP health；未来 CLI doctor 只显示 present/missing/来源，永不回显 secret |
| “GitHub/GitLab 完整周边” | 它们是独立直连 API 工具，不共享 web pipeline 的 cache、budget、rerank 或 fallback；GitLab 仅有 token 时注册。运行时还始终注册 README 未列出的 `report_search_usage`。见 [`index.ts#L146-L159`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/index.ts#L146-L159) | 这是工具广度，不是 web-search 深度；先用需求证据判断是否增加默认工具面 |
| “生产 timeout” | orchestrator 用 `Promise.race` 返回 timeout，但没有把该 signal 传入 router/provider，底层请求可继续运行。见 [`orchestrator.ts#L169-L183`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/search/orchestrator.ts#L169-L183) | 保留 Agent Search 已完成的端到端 AbortSignal 传播 |

还有一个与本项目定位直接相关的边界：其 query normalizer 使用不带 Unicode
属性的 `\w` 白名单，中文字符会被删除；纯中文查询可归一化为空字符串。
见
[`query-normalizer.ts#L8-L15`](https://github.com/ilgizar-valiullin/mcp-web-hound/blob/f468da9943952fddc1ed71ca977b18b60f40ca11/src/search/query-normalizer.ts#L8-L15)。
因此它当前不能作为 Agent Search 中文路由的实现参考。

#### 真正值得吸收

1. **把控制面命名并展示出来**：cache、budget、provider cooldown、status、
   configure/doctor 各自有清楚入口；
2. **持久精确缓存 + 可选语义查询复用**：适合重复技术查询，但必须先解决
   cache key、freshness、provider 配置、tenant/session 隔离和安装体积；
3. **配置 CLI**：比要求用户手写大量环境变量更友好，但输出必须脱敏，写操作必须
   显式且可预览；
4. **专题文档和 Mermaid**：把 pipeline、fallback、cache 和 budget 单独解释，
   但能力表应从真实注册表/配置 schema 生成，避免文档领先于代码；
5. **Agent 使用反馈关联**：`search_id` / `doc_id` / used-doc signal 值得进入离线
   评测候选，但上报是写操作，不能默认要求 Agent 自动执行，更不能冒充相关性真值。

#### 不吸收

- 不用进程级“15 次/30 分钟”替代请求级 calls/time/evidence budget；
- 不用本地 NLI/embedding 的存在感代替盲评和 pooled qrels；
- 不把 GitHub/GitLab 直连工具塞进默认搜索面来制造“功能完整”观感；
- 不用 `latest` 生产依赖、未取消的 Promise timeout 或丢失 per-provider failure；
- 不增加捐赠钱包来暗示可信度；长期承诺用活跃维护、可复现发布和安全响应证明。

### 另外两个近期 MCP 样本

- [`Aas-ee/open-webSearch@3094fa5`](https://github.com/Aas-ee/open-webSearch/tree/3094fa558fce35a8373e45ed5a6c43362e206906)（Apache-2.0）把 limit 平分给所有引擎并 `Promise.all`，保留 `partialFailures`，但没有跨引擎去重、补配额或质量停止。DDG 是 d.js preload → HTML，不是 Lite。
- [`tickernelz/mcp-web-search@5e43efd`](https://github.com/tickernelz/mcp-web-search/tree/5e43efd0854e24ad8ac9bb7e1e7ea91011d4ec5f)（MIT）采用 DDG → SearXNG → Bing 顺序 fallback，第一个非空结果即返回，不聚合、不评分。其安全下载实现检查 DNS/private IP、逐跳 redirect 和下载字节上限，值得继续用于 Extract 安全审计。

这两个样本都只有结果数 limit，没有 Agent Search 已有的 passage/evidence
预算。它们进一步说明“能并行几个搜索源”本身不是差异化。

## 深度研究 Agent：真实代码模式

### Vane

源码快照：[`7dc5d08`](https://github.com/ItzCrazyKns/Vane/tree/7dc5d088f7262fbc5e39037f84940a8a2193c5fb)，MIT。

- Classifier 用结构化输出同时判断是否需要搜索、来源类型和独立问题改写。
- Researcher 按模式设置 2、6、25 次循环上限；无工具调用或模型调用 `done` 时结束。单轮最多三个查询主要依赖提示词约束。
- 检索后做相似度排序、语义去重并截断到 20 条。
- Writer 接收编号结果，但引用正确性只靠提示词，没有后置支持性验证。
- 同轮工具使用裸 `Promise.all`，一个异常可能击穿整批。Session 是带 TTL 的内存 Map，不是 durable checkpoint。

可吸收的是“小扇出独立问题改写”；不吸收 25 轮默认深搜、模型自报完成、提示词式引用和整批失败。

关键实现：
[classifier](https://github.com/ItzCrazyKns/Vane/blob/7dc5d088f7262fbc5e39037f84940a8a2193c5fb/src/lib/agents/search/classifier.ts#L6-L53)、
[research loop](https://github.com/ItzCrazyKns/Vane/blob/7dc5d088f7262fbc5e39037f84940a8a2193c5fb/src/lib/agents/search/researcher/index.ts#L59-L183)、
[batch execution](https://github.com/ItzCrazyKns/Vane/blob/7dc5d088f7262fbc5e39037f84940a8a2193c5fb/src/lib/agents/search/researcher/actions/registry.ts#L82-L104)。

### GPT Researcher

源码快照：[`5d84d2f`](https://github.com/assafelovic/gpt-researcher/tree/5d84d2f5553e70a2765a8ff3a0d2672d60437ce8)，Apache-2.0。

- Planner 先对原问题做一次搜索，再根据真实结果规划子问题，而不是在零证据时一次性猜完整计划。
- Deep 模式显式限制 breadth、depth 和 concurrency，子任务使用 semaphore；零查询、全部分支失败或深度耗尽时停止。
- Context Compressor 使用分块、重叠和 embedding；内容小于 8000 字符时走快路径，避免为压缩而压缩。
- Writer 在完全没有证据时拒绝生成一份看似有来源的报告。
- 分支异常主要写日志并转成空值，没有 Agent Search `partialFailures` 这样的结构化合同。

可吸收的是 fast/deep 分流、小内容快路径、有限并发和零证据 abstain；不吸收固定递归树和日志式失败。

关键实现：
[search-before-plan](https://github.com/assafelovic/gpt-researcher/blob/5d84d2f5553e70a2765a8ff3a0d2672d60437ce8/gpt_researcher/skills/researcher.py#L50-L95)、
[bounded deep research](https://github.com/assafelovic/gpt-researcher/blob/5d84d2f5553e70a2765a8ff3a0d2672d60437ce8/gpt_researcher/skills/deep_research.py#L377-L575)、
[compression fast path](https://github.com/assafelovic/gpt-researcher/blob/5d84d2f5553e70a2765a8ff3a0d2672d60437ce8/gpt_researcher/context/compression.py#L127-L188)、
[zero-evidence abstain](https://github.com/assafelovic/gpt-researcher/blob/5d84d2f5553e70a2765a8ff3a0d2672d60437ce8/gpt_researcher/skills/writer.py#L77-L88)。

### Open Deep Research

源码快照：[`d337ae3`](https://github.com/langchain-ai/open_deep_research/tree/d337ae32ed4ff8f4c6fbe192ba3bf1b2d6610799)，MIT。

公开图边界很清楚：

```text
clarify → research brief → supervisor → researcher
        → raw notes + compressed research → final report
```

- 默认最多 5 个并发研究单元、6 次 supervisor 迭代、每个 researcher 10 次工具循环。
- Supervisor 和 Worker 分别有上限；Researcher 同时保留 raw notes 和 compressed research。
- “三条来源、两轮结果相似即可停止”只写在提示词里，并非确定性检查。
- Typed state 区分原始证据、压缩结论和迭代计数，但主图默认没有 durable checkpointer。
- Supervisor 异常和工具异常可能被提前结束或字符串化，失败语义弱于 Agent Search 当前实现。

可吸收的是 Planner/Executor/Summarizer 边界、双层预算和原始/压缩证据分离；不把 Supervisor 图下沉到 MCP 核心。

关键实现：
[graph topology](https://github.com/langchain-ai/open_deep_research/blob/d337ae32ed4ff8f4c6fbe192ba3bf1b2d6610799/src/open_deep_research/deep_researcher.py#L699-L719)、
[limits](https://github.com/langchain-ai/open_deep_research/blob/d337ae32ed4ff8f4c6fbe192ba3bf1b2d6610799/src/open_deep_research/configuration.py#L42-L118)、
[researcher/compression loop](https://github.com/langchain-ai/open_deep_research/blob/d337ae32ed4ff8f4c6fbe192ba3bf1b2d6610799/src/open_deep_research/deep_researcher.py#L451-L585)、
[typed state](https://github.com/langchain-ai/open_deep_research/blob/d337ae32ed4ff8f4c6fbe192ba3bf1b2d6610799/src/open_deep_research/state.py#L55-L96)。

### Jina node-DeepResearch

源码快照：[`fd323b5`](https://github.com/jina-ai/node-DeepResearch/tree/fd323b521a51264d497bec333bfb997da1bf3210)，Apache-2.0。

- 主循环同时做规划、搜索、访问、反思、评估和写作；默认 Token budget 可到 1,000,000，并保留一部分预算强制生成最终答案。
- 首轮后可递归拆给多个 researcher；LLM evaluator 通过时提前停止，连续失败则进入更激进模式。
- Query-aware late chunking 选择 2–5 个不重叠窗口；引用通过答案块与网页块相似度匹配后注入脚注。
- 这种相似度只能叫候选对齐，不能证明页面蕴含主张。
- Token/action tracker 都在内存中；预算耗尽仍强制回答与“失败透明”目标冲突。

可吸收的是一等公民预算、非重叠 passage 和答案块到证据块的候选映射；不吸收百万 Token、递归团队、自评即真值或强制回答。

关键实现：
[main budget loop](https://github.com/jina-ai/node-DeepResearch/blob/fd323b521a51264d497bec333bfb997da1bf3210/src/agent.ts#L419-L518)、
[query-aware late chunking](https://github.com/jina-ai/node-DeepResearch/blob/fd323b521a51264d497bec333bfb997da1bf3210/src/tools/jina-latechunk.ts#L8-L127)、
[citation candidate alignment](https://github.com/jina-ai/node-DeepResearch/blob/fd323b521a51264d497bec333bfb997da1bf3210/src/tools/build-ref.ts#L142-L229)。

### 本轮增量代码对照

- Perplexica/Vane 的 `baseSearch` 先做 query-result similarity 过滤，再做
  semantic dedup，最后截断为展示结果。Agent Search 已吸收这一顺序约束：
  路由停止门必须评估变换后的 display basket，而不是变换前的原始列表。
  [固定源码](https://github.com/ItzCrazyKns/Perplexica/blob/7dc5d088f7262fbc5e39037f84940a8a2193c5fb/src/lib/agents/search/researcher/actions/search/baseSearch.ts)
- Jina reranker 分批处理文档、保留原始索引、全局排序并记录 Token 使用量。
  本轮只吸收“重排输出是后续判断的权威序列”，不增加远程 rerank 依赖；
  Token 使用量进入后续预算遥测候选。
  [固定源码](https://github.com/jina-ai/node-DeepResearch/blob/fd323b521a51264d497bec333bfb997da1bf3210/src/tools/jina-rerank.ts)
- LLMLingua 把 context、sentence、token 三层预算拆开，并允许
  `target_token` 驱动粗到细压缩。后续可把当前字符预算深化为分层预算，
  但 provenance、失败和哈希关联不进入可删除内容。
  [固定源码](https://github.com/microsoft/LLMLingua/blob/e0e9d99beb94098bbd924aa53c2c112eac41c758/llmlingua/prompt_compressor.py)
- GitHub MCP Gateway 把 Guard 的资源标注与 Reference Monitor 的准入决策
  分开，并先规范化策略。这个模式属于 Slim Guard，不下沉到搜索核心；
  Agent Search 只输出可供策略消费的结构化证据。
  [固定源码](https://github.com/github/gh-aw-mcpg/blob/e53395eac55c939fee47bc2fc214a503eb7c320e/internal/guard/guard.go)

### Agent 层与 MCP 核心的明确边界

| 能力 | Search Agent | Agent Search MCP |
|---|---|---|
| Planner | 澄清、独立问题改写、每轮 2–3 个子问题、fast/deep | 规范化、语言/来源路由、确定性变体 |
| 循环 | 未解决 gaps、总轮次/模型 Token/成本 | 单请求 deadline、取消、引擎/结果/字符预算 |
| 停止 | 证据是否足够、是否追问、研究总上限 | 新 canonical URL/新域名增量、预算、取消、全部失败 |
| Executor | 决定下一轮搜什么 | 并发、waterfall、缓存、限流、重试、rerank、`partialFailures` |
| Summarizer | 跨轮合成、主张、abstain、最终引用 | 只产出 query-aware evidence packet |
| 状态 | brief、gaps、查询、visited URLs、证据引用、预算、stop reason | 请求内状态和性能缓存，不依赖隐藏 session |

Search Agent 的持久状态应只保存可审计事实，不保存隐藏推理文本：

```ts
{
  researchBrief,
  pendingGaps,
  completedQueries,
  visitedCanonicalUrls,
  evidenceRefs,
  partialFailures,
  budget: { rounds, calls, elapsedMs, llmTokens },
  stopReason
}
```

## 设计决策

### 1. MCP 核心不内置 LLM Planner

基础搜索必须在没有模型密钥、没有账户、离线测试和确定性 benchmark 中仍可运行。问题分解、深度研究和最终写作属于 Search Agent/Skill。

### 2. 用“搜索策略”统一功能，而不是继续增加工具

建议内部策略至少包含：

- `quick`：少量免费引擎、短 passage、低延迟；
- `verify`：多独立 provider、要求多源印证；
- `deep`：允许更多阶段、提取和商业上游；
- `chinese`：Sogou/Baidu 优先，并保留中文原词。

短期不修改 MCP 工具签名。先把这些策略映射到现有普通/高级工具和内部配置，积累 benchmark 后再决定是否公开。

### 3. 瀑布停止使用多条件门，而不是一个总分

停止条件应同时回答：

1. 是否至少有 `N` 个结果；
2. Top-K 来源可靠性是否达标；
3. Top-K 中是否至少有 `N` 个结果通过查询相关性门；
4. 对 `verify` 策略，是否存在足够的独立 provider。

不要把这四项相加成一个不可解释分数。默认相关性门只是待校准启发式，必须在真实 pooled qrels 上校准，不能作为公开质量声明。

### 4. 输出双通道

- `content`：紧凑、便于人和通用客户端阅读；
- `structuredContent`：完整 schema，包含结果、evidence、执行阶段、预算、失败和来源映射。

Slim Guard 应消费后者。压缩可以改变展示长度，但不能删除 provenance、失败和哈希关联。

### 5. Query expansion 按“角度”而不是同义词堆叠

中文繁简体、明显别名等确定性变体可以留在核心。复杂问题的子问题、反方证据、时间线、实现细节等研究角度由上层 Agent 生成，并设置最大并行数、最大轮次和总预算。

### 6. 长任务使用可恢复状态，不使用无限轮询

如果以后提供 Research Agent，应有 run ID、terminal state、deadline、heartbeat、取消和 resume；Supervisor 与 Worker 分别限制并行数/轮次。模型说 `done` 只是一个候选信号，不能覆盖确定性的预算、增量和失败检查。

### 7. 零证据时明确 abstain

预算耗尽、所有 provider 失败或没有可引用 passage 时，返回缺口和失败原因。不能为了“总要给用户一个答案”而生成带伪引用的报告。

### 8. 状态优先使用 Resource/CLI，不增加默认工具 Token

Agent Search 已有 `search://health`、`mcp://health/metrics`、
`search://capabilities` 和 HTTP `/health`。先把这些入口在 README 中讲清楚；
若新增 `fasm doctor`，只显示 provider/依赖/config 是否就绪和配置来源，不回显
API Key、Bearer token 或其他 secret。除非客户端兼容性数据证明 Resource
不可发现，否则不再注册一个功能重复的 `status` 工具。

### 9. 持久缓存先做隔离实验，不直接引入默认原生依赖

持久 exact/semantic cache 的 cache key 至少绑定 normalized query、语言、策略、
过滤器、provider 配置版本、输出/证据 schema 和 freshness policy；带 request
signal 的请求不能共享全局 pending promise。实验必须比较 Node 18/20/22 和
Windows/Linux 的安装成功率、冷启动、RSS、p95 延迟、命中率、错误复用率和陈旧率。
通过前继续使用轻量进程内 cache；语义能力保持 opt-in。

### 10. Intent classifier 只有在改变并改善策略时才进入核心

先定义 `docs`、`news`、`code/repository`、中文和普通 web 的盲测 slice，
比较确定性规则、轻量分类器和无分类基线。分类结果必须实际改变 provider/TTL/
freshness 策略，并通过质量、失败率、延迟和内存门；仅生成一个 `intent` 标签不算
产品能力。

## 建议实施顺序

### P0：本轮

1. 更正 README 中 Tavily/Exa keyless 边界，保留“本地零账号、多源、中文、Token”差异化；
2. 修复瀑布停止：要求足够的逐条相关结果，而不是只看高置信来源；
3. 修正 C2 路线图，不把 Lite 描述为限流绕过或已证明的可用率提升；
4. 保留当前失败证据和 circuit breaker，不对 CAPTCHA 自动重试。

### P1：下一轮

1. 稳定 MCP 工具返回 `structuredContent` 和 output schema；
2. 将 adapter 与独立 upstream/provider 分开建模；
3. 给执行元数据增加 `stop_reason` 和每项门槛的观测值；
4. 用真实 pooled qrels 校准相关性门，AI 评测只跑小规模分歧样本。
5. 在 README 展示现有 health/capabilities Resource 和真实搜索流水线；
6. 设计脱敏 `fasm doctor`，但不增加重复的 MCP `status` 工具。

### P2：Agent 层

1. 新建独立 Search Agent Skill/包，不放进基础 MCP 运行时；
2. 实现有界的 plan → parallel search → dedup → gap check → synthesize；
3. 把每轮总查询数、提取字符数、时间和模型 Token 设成硬预算；
4. 通过 Slim Guard 接收结构化 evidence 并执行安全/压缩策略。

### P3：有门槛的本地智能与持久化实验

1. 先做持久 exact cache 的可替换 backend，不把 native/vector 依赖放进默认安装；
2. 在真实重复查询集上量化 semantic cache 的命中、错误复用和 freshness 风险；
3. 在 EN/ZH 与 docs/news/code slice 上比较 intent classifier 和确定性路由；
4. 只有同时通过 Node 18、Windows、取消、隔离、内存和质量门，才讨论生产启用。

## 本轮验收标准

- 研究结论能追溯到固定 commit 或官方当前源码；
- README 不再声称 Tavily/Exa 完全没有 keyless 入口；
- 高置信但低相关的结果不能让瀑布提前停止；
- DDG 202/CAPTCHA 仍被明确报告，不被伪装成空的成功；
- 不增加运行时 LLM 依赖，不改变现有 MCP 输入签名。
