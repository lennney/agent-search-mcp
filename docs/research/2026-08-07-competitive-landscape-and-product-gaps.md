# Agent Search MCP 竞品格局与差异化机会

日期：2026-08-07

## 调研结论

Web Search MCP 已经是拥挤赛道。以下卖点单独使用时都不再构成差异化：

- 免费或无 API Key；
- 支持多个搜索引擎；
- 同时提供 Search 和 Fetch；
- 支持 MCP、CLI 或 HTTP；
- 面向 Agent 做简短结果格式化。

Agent Search 当前最有防御力的方向不是“引擎更多”，而是：

> **本地优先、免费优先、中文原生的 Search Evidence Router：用有界回退取得结果，并把独立来源、停止原因、失败与上下文预算交给 Agent 检查。**

这一定义把 Agent Search 与三类产品区分开：

1. Open-WebSearch、OneSearch、DDGS 解决“能免费搜到什么”；
2. Tavily、Exa、Brave、Firecrawl、Jina 解决“如何从一个托管服务取得更强的搜索、抓取或研究能力”；
3. Agent Search 应重点解决“Agent 为什么可以继续使用这批证据，以及它还缺什么”。

目前这个差异已经存在于代码，但没有被产品化到第一眼可见。下一步不应先增加新闻、图片、浏览器操作或更多 Provider，而应先完成**定位收敛、证据 Demo、Agent Skill 和外部对照评测**。

## 调研口径

本报告使用三种证据：

- 当前官方仓库与固定 commit 的源码；
- 官方产品文档和定价页；
- GitHub API 与官方 MCP Registry 在 2026-08-07 的时间点快照。

限制：

- GitHub stars、价格、免费额度和产品工具面会变化；
- 托管搜索的索引和内部排序不可见；
- 本报告比较产品边界、公开实现和分发，不把官网质量自述当作搜索质量证据；
- 没有运行跨产品 live query，因此不判断哪家搜索质量更高；
- OneSearch 的本轮判断主要基于官方 README；Open-WebSearch 和 DDGS 另做了固定源码检查。

## 竞品分层

| 层级 | 代表 | 用户购买的核心价值 | 对 Agent Search 的压力 |
|---|---|---|---|
| 本地零 Key 搜索 MCP | Open-WebSearch、OneSearch、DDGS、Heventure Search MCP | 安装后立即搜索，不注册账号 | 直接削弱“免费、多引擎、无 Key”的独特性 |
| 托管 Agent Search / Web Data | Tavily、Exa、Brave、Firecrawl、Jina | 稳定索引、抓取、研究、垂直搜索和远端免运维 | 在结果质量、抓取深度和安装体验上形成强势默认项 |
| 元搜索与自托管基础设施 | SearXNG、DDGS、OpenSERP | 大量 Provider、统一结果、自托管 | 让“聚合多个搜索源”变成基础能力 |
| 深度研究 Agent | GPT Researcher、Open Deep Research、Jina DeepResearch 等 | 多轮规划、研究和写作 | 容易诱导 Agent Search 越界内置 LLM Planner |

深度研究 Agent 的源码边界已经在
[`2026-07-26-agent-search-product-architecture.md`](./2026-07-26-agent-search-product-architecture.md)
中分析。本报告只更新与当前产品竞争最直接的 Search MCP 和托管服务。

## 直接开源竞品

### 分发快照

以下数字来自 2026-08-07 GitHub API，只表示开源分发规模，不表示质量：

| 项目 | Stars | Forks | 最近 push | 主要交付面 |
|---|---:|---:|---|---|
| [Agent Search MCP](https://github.com/lennney/agent-search-mcp) | 83 | 6 | 2026-08-03 | npm、MCP stdio/HTTP、CLI、官方 Registry |
| [Open-WebSearch](https://github.com/Aas-ee/open-webSearch) | 1,687 | 178 | 2026-08-03 | npm、MCP、CLI、daemon、Docker、Skill |
| [DDGS](https://github.com/deedy5/ddgs) | 2,868 | 274 | 2026-05-23 | Python library、CLI、API、MCP |
| [OneSearch MCP](https://github.com/yokingma/one-search-mcp) | 136 | 21 | 2026-07-31 | npm、MCP、Docker、浏览器搜索/抓取 |
| [mcp-web-hound](https://github.com/ilgizar-valiullin/mcp-web-hound) | 19 | 1 | 2026-07-04 | MCP、缓存、rerank、Provider router |
| [Heventure Search MCP](https://github.com/HughesCuit/heventure-search-mcp) | 7 | 0 | 2026-05-13 | PyPI、MCP、Docker |

官方 MCP Registry 在该时间点将 `io.github.lennney/agent-search-mcp@3.2.0`
和 `io.github.yokingma/one-search-mcp@1.2.4` 标为 latest。以包名查询时，
Open-WebSearch、DDGS、mcp-web-hound 和 Heventure 没有返回对应条目。Registry 可见性是
Agent Search 已有的分发优势，但不是使用体验优势。

### 能力与边界

| 产品 | 强项 | 对 Agent Search 的直接威胁 | 没有覆盖的 Agent Search 核心 |
|---|---|---|---|
| Open-WebSearch | 中文/英文多引擎；MCP + CLI + daemon + Docker + Skill；通用网页和中文技术站抓取；无 Key | 定位非常相似，分发规模显著更大，安装路径和 Skill 叙事更完整 | 没有当前 Agent Search 的 provider-family 证据、质量停止门、共享请求/证据预算和 MCP `structuredContent` 合同 |
| DDGS | 成熟元搜索库；文本、图片、新闻、视频、图书和提取；URL 去重和跨 Provider 并发；CLI/API/MCP | 免费搜索面更宽，Python 用户采用成本低，垂直工具明显更多 | MCP 层基本是库函数的薄封装；不返回逐 Provider 失败、停止原因或 Agent 证据包 |
| OneSearch | 本地浏览器搜索；SearXNG/商业 API Provider；map/scrape/extract；浏览器动作；无 Key 本地路径 | 抢占“一个工具覆盖搜索和抓取”的心智，并覆盖 Baidu/Sogou 本地搜索 | 当前公开口径是选择一个 configured provider，不是可解释的多源证据合成 |
| mcp-web-hound | 多 Provider、SQLite/semantic cache、rerank、budget、CLI 配置 | 功能名最接近 Agent Search 的控制面 | 分发很小；既有源码审计发现中文 query normalization 和失败/取消语义不足 |
| Heventure | DuckDuckGo/Bing/Google 零 Key；可选 SerpAPI/Tavily；缓存 | “十秒安装、永久免费”的简单叙事 | 公开分发很小，未体现独立来源语义或证据合同 |

### Open-WebSearch 固定源码对照

源码快照：
[`3f36330`](https://github.com/Aas-ee/open-webSearch/tree/3f36330dfba873d66c52116d8c8334aaf65137f4)。

它是当前最接近的直接竞品，也说明 Agent Search 不能继续依赖功能数量来区分：

- 搜索服务把总 `limit` 平分给选中的引擎，并行执行后直接 `flat().slice(0, limit)`；
  见
  [`searchService.ts#L46-L82`](https://github.com/Aas-ee/open-webSearch/blob/3f36330dfba873d66c52116d8c8334aaf65137f4/src/core/search/searchService.ts#L46-L82)。
- 它保留 `partialFailures`，这已经不是 Agent Search 独占能力；但失败只有
  `engine_error` / `unsupported_engine`，没有 timeout、rate limit、bot challenge、
  permission 或 budget 等恢复语义。
- 聚合路径没有 URL 去重、provider-family 归并、query relevance 门或质量停止条件；
  结果数量只是均分和最终截断。
- MCP 搜索工具把完整对象序列化进文本 `content`；没有 output schema 和
  `structuredContent` 双通道。见
  [`setupTools.ts#L84-L131`](https://github.com/Aas-ee/open-webSearch/blob/3f36330dfba873d66c52116d8c8334aaf65137f4/src/tools/setupTools.ts#L84-L131)。
- 产品交付体验强于 Agent Search：当前仓库同时维护 CLI、daemon、Docker 和两个
  Agent Skills，并明确解释何时用哪条路径。
- HTTP 是需要谨慎对比的边界：未设置 `MODE` 时默认开启 HTTP，监听
  `0.0.0.0`，源码中的 DNS rebinding protection 仍是注释示例，且入口没有默认
  Bearer auth。见
  [`config.ts#L62-L65`](https://github.com/Aas-ee/open-webSearch/blob/3f36330dfba873d66c52116d8c8334aaf65137f4/src/config.ts#L62-L65)
  和
  [`index.ts#L93-L263`](https://github.com/Aas-ee/open-webSearch/blob/3f36330dfba873d66c52116d8c8334aaf65137f4/src/index.ts#L93-L263)。

这意味着 Agent Search 的真实优势是“更深的搜索合同和部署门禁”，而
Open-WebSearch 的真实优势是“更清晰的安装、Skill 和零 Key 中文产品故事”。

### DDGS 固定源码对照

源码快照：
[`a12929a`](https://github.com/deedy5/ddgs/tree/a12929a72429a39a0841c3d7caacb20ee17acd4d)。

- DDGS 已经直接提供 stdio MCP，暴露文本、图片、新闻、视频、图书和正文提取六个工具；
  见
  [`mcp.py`](https://github.com/deedy5/ddgs/blob/a12929a72429a39a0841c3d7caacb20ee17acd4d/ddgs/api_server/mcp.py)。
- 元搜索层按 upstream provider 去重调度，按 URL 去重，并使用跨引擎出现次数和
  `SimpleFilterRanker` 排序；见
  [`ddgs.py#L173-L223`](https://github.com/deedy5/ddgs/blob/a12929a72429a39a0841c3d7caacb20ee17acd4d/ddgs/ddgs.py#L173-L223)
  和
  [`results.py#L102-L148`](https://github.com/deedy5/ddgs/blob/a12929a72429a39a0841c3d7caacb20ee17acd4d/ddgs/results.py#L102-L148)。
- 它仍在唯一结果数达到目标后停止；这个条件没有验证 query relevance。
- Provider 异常主要进入日志；只要还有结果，MCP 调用方不会得到逐 Provider
  `partialFailures`。
- MCP 工具返回库结果列表，没有 Agent Search 的共享 evidence budget、stop reason、
  provider-family count 或紧凑文本/完整结构双通道。

DDGS 证明“聚合、去重和简单排名”也已经是现成基础设施。Agent Search 必须继续强调
可解释停止和失败，而不是把元搜索本身当作 moat。

### OneSearch 的相邻压力

当前快照：
[`16eb424`](https://github.com/yokingma/one-search-mcp/tree/16eb424608888949165f6a668d476cbdf79afc20)。

OneSearch 当前默认使用本地浏览器搜索，并暴露 `one_search`、`one_scrape`、
`one_map`、`one_extract`。它支持 Bing、Google、Baidu、Sogou 等本地浏览器路径，
也能切换到 DuckDuckGo、SearXNG、Tavily、Exa、Bocha、You.com 等 Provider。

它带来的产品压力不是证据合成，而是**本地浏览器作为统一可用性后备**：当 HTML
搜索端点被 challenge 时，用户很容易理解“让浏览器搜”。Agent Search 当前刻意不做
TLS 指纹伪装和 challenge 绕过，这个安全/合规边界应保留，但需要把权衡讲清楚：

- Agent Search 追求轻量、确定性、可审计和低依赖；
- OneSearch 以 Chromium 依赖换取浏览器渲染、交互和更宽抓取面；
- 不应为了功能表追平而把浏览器自动化加入默认 runtime。

## 托管竞品

### 产品与价格快照

| 产品 | 当前 MCP / 产品面 | 免费入口 | 公开价格快照 | 对 Agent Search 的意义 |
|---|---|---|---|---|
| [Tavily](https://github.com/tavily-ai/tavily-mcp) | Search、Extract、Map、Crawl；本地 MCP 和远端 OAuth/API Key | 免费账户 1,000 credits/月 | PAYG $0.008/credit；basic/fast/ultra-fast search 为 1 credit，advanced 为 2 | 显式速度/深度档位和 OAuth onboarding 很强 |
| [Exa](https://github.com/exa-labs/exa-mcp-server) | 默认 Web Search + Fetch；可选高级搜索和 Agent；远端 MCP、Skill | $20 注册额度 + $10/月 free tier | Search $7/1k requests；Contents $1/1k pages；Agent $0.012-$1/run | 语义搜索、代码搜索、highlight 和低摩擦远端连接强 |
| [Brave](https://github.com/brave/brave-search-mcp-server) | 独立索引；Web/LLM context/图片/视频/新闻等；stdio/HTTP | $5/月 credits，但需要账号/API Key | Search $5/1k requests；Answers $4/1k + Token | 独立索引和丰富垂直面强，Agent Search 不应声称索引质量优势 |
| [Firecrawl](https://github.com/firecrawl/firecrawl-mcp-server) | Search、Scrape、Interact、Map、Crawl、Parse、Extract、Agent、Research 等 | 托管 MCP 的 Search/Scrape/Interact keyless 且限流；发布说明为 1,000 credits/月 | 额度制，失败计费边界见官方 pricing | “无需 Key + Search + Fetch”已不是本地工具专属；search-only profile 值得借鉴 |
| [Jina MCP](https://github.com/jina-ai/MCP) | 19 个 Reader/Search/Rerank/Dedup/学术工具；远端 MCP | read/screenshot 可限流免 Key；web search 需要 Key | 额度随 Jina API 计划 | server-side tool filtering 直接把工具 schema Token 当产品问题处理 |

价格来源：
[Tavily pricing](https://www.tavily.com/pricing)、
[Tavily Search docs](https://docs.tavily.com/documentation/api-reference/endpoint/search)、
[Exa pricing](https://exa.ai/pricing?tab=api)、
[Brave Search API](https://brave.com/search/api/)、
[Firecrawl pricing](https://www.firecrawl.dev/pricing)。

### 托管竞品改变了什么

1. **Keyless 不是 moat。** Firecrawl 已提供受限 keyless 托管 MCP，Exa 的远端 MCP
   也可以先按无本地 Key 配置接入；真正差异应是本地执行、无需账户、没有单一托管
   Provider 锁定，而不只是“配置里没有 Key”。
2. **Search + Fetch 不是 moat。** Tavily、Exa、Firecrawl、Jina 和多个本地 MCP
   都把这组能力作为基础面。
3. **工具 Token 已进入竞品产品设计。** Jina 支持 server-side include/exclude tool；
   Firecrawl 提供 search-only profile；Exa 默认只开 Search + Fetch，把高级工具和
   Agent 设为可选。Agent Search 已有 `ENABLED_TOOLS` / `DISABLED_TOOLS`，但需要在
   onboarding 和 Skill 中被看见。
4. **Hosted 竞品擅长更深内容，不擅长解释多个独立上游。** 它们的 score、summary
   或 answer 属于单一服务内部语义，不能替代 Agent Search 的 provider-family、
   failure 和 stop evidence。

## Agent Search 当前真正领先的合同

当前本地源码基线为
[`0221691`](https://github.com/lennney/agent-search-mcp/tree/0221691c157cfe2d42a4cbc70e50d1259f953ec5)。

### 1. 独立来源不是 Adapter 数量

Agent Search 区分 adapter 和 upstream provider family。同一上游的多个表示或
适配器不能增加 `source_count`。这比“多引擎并行后按 URL 去重”更接近 Agent
验证需求。

### 2. 停止条件可检查

并行和 waterfall 共享 Search Evidence evaluator。停止同时考虑：

- 结果数量；
- 逐条 query relevance；
- 平均 confidence；
- provider-family 覆盖；
- semantic rerank/dedup 后的实际 display basket。

返回值保留 `quality_gate_stage`、每项观察值和 `stop_reason`，而不是只告诉 Agent
“拿到了 N 条”。

### 3. 失败和预算是一等证据

`partialFailures` 区分 timeout、rate limit、bot challenge、permission、budget
等失败类型。请求预算统一限制 adapter calls、elapsed time、raw results 和
evidence characters，并把耗尽原因返回给 Agent。

### 4. MCP 双通道输出

紧凑文本用于通用客户端，完整 `structuredContent` 通过 output schema 保留结果、
provenance、失败、门槛和预算。见
[`search-output.ts#L62-L173`](https://github.com/lennney/agent-search-mcp/blob/0221691c157cfe2d42a4cbc70e50d1259f953ec5/src/tools/search-output.ts#L62-L173)。

### 5. 中文不是 region 参数

Agent Search 的中文能力来自 Sogou/Baidu 路由、中文 query variants、中文 Provider
和 CSDN/掘金内容路径，而不是只把通用索引的 region 设为 `cn-zh`。这一点仍有真实
区分度，但 Open-WebSearch 和 OneSearch 已经覆盖相似的中文源，不能只靠“支持中文”
表述。

### 6. HTTP 安全默认值

Agent Search 的 HTTP/both 模式默认要求 Bearer token，并对 Origin 做 allowlist。
正文提取带 SSRF 防护、redirect 约束和预算。这个边界适合面向需要本地 daemon 或
局域网部署的用户，但不应泛化成“比所有竞品更安全”的未经验证声明。

## Agent Search 当前劣势

### 1. 差异存在于内部，用户看不到

README 和工具 schema 有大量正确细节，但缺少一个 30-60 秒即可理解的对照：

- 一个 Provider 失败时，普通聚合器仍返回 N 条；
- Agent Search 同时返回 N 条、失败原因、是否有独立来源、为什么停止和用了多少预算。

没有这个 Demo，`provider family`、`evidence packet`、`quality gate` 很容易被看成术语。

### 2. 分发落后于最接近的本地竞品

Agent Search 已进入官方 Registry，但 GitHub 分发规模明显低于 Open-WebSearch 和
DDGS，也略低于 OneSearch。竞品已经使用 Skill、Docker、remote MCP、OAuth、
one-click connector 等路径降低安装和理解成本。

### 3. 没有外部质量胜负证据

当前 frozen benchmark 证明格式、Token 和指标代码可复现，不证明搜索质量。
在完成多系统 capture、pooled judging 和 adjudication 前，不能声称结果比 Tavily、
Exa、Brave、Open-WebSearch 或 DDGS 更好。

### 4. 宽工具面不占优

DDGS 有图片、新闻、视频、图书；Firecrawl 有 crawl/interact/agent；OneSearch 有
browser map/scrape/actions。Agent Search 当前没有独立新闻工具，不提供通用时间过滤，
也不做浏览器自动化。这些是明确限制，但与“证据路由”定位并不冲突。

### 5. 产品元数据仍有漂移

当前 `SEARCH_PROVIDERS` 有 16 个 adapter，但 `free_search` 的工具描述仍写着
“Twelve adapters are selectable”；见
[`free-search.ts#L1440-L1465`](https://github.com/lennney/agent-search-mcp/blob/0221691c157cfe2d42a4cbc70e50d1259f953ec5/src/tools/free-search.ts#L1440-L1465)。
这会直接削弱“运行时注册表是权威来源”的可信度，应作为后续打磨的 P0 小修。

## 建议的产品定位

### 一句话

英文候选：

> Evidence-first web search MCP for local agents — free-first English/Chinese routing, bounded fallback, and inspectable failures.

中文候选：

> 面向本地 Agent 的证据优先搜索 MCP：免费优先路由中英文来源，并明确返回失败、独立来源和停止原因。

这比“free + token efficient + Chinese + multi-source”更能回答“为什么不是
Open-WebSearch、DDGS 或 Firecrawl”。原有四个卖点仍可作为支持点，不再作为并列主标题。

### 应避免的定位

- “最好的免费搜索 MCP”：没有外部质量证据；
- “16 个搜索引擎所以更可靠”：adapter 数量不等于独立来源或可用率；
- “唯一无 Key”：Open-WebSearch、DDGS、OneSearch、Heventure 和 Firecrawl
  keyless 都会反例；
- “支持新闻/时间过滤”：当前稳定合同明确不支持；
- “深度研究 Agent”：会模糊 MCP 核心的确定性边界。

## 优先级建议

### P0：先让差异一眼可见

1. 修正工具描述中的 12/16 漂移，并用运行时 registry 生成或校验该数字。
2. 在 README 首屏增加一个紧凑的“普通多引擎聚合 vs Agent Search evidence”对照，
   不使用搜索质量胜负措辞。
3. 做一个可复现 Demo，展示：
   - 同一 URL 来自同 family 时不虚增 `source_count`；
   - 一个 Provider challenge/timeout 时仍能降级，但 `partialFailures` 不消失；
   - `quality_gate` 满足后停止，或预算耗尽后明确退出；
   - `content` 比 `structuredContent` 紧凑，但没有删除 provenance。
4. Demo 优先使用冻结 fixture 或显式标注的低频 capture，不为了演示主动触发反爬。

### P1：补齐 Agent onboarding

1. 提供官方 Agent Search Skill，指导 Agent 在 `quick`、`verify`、`chinese`、
   `extract` 路径中选择最小工具面。
2. Skill 只做使用策略，不把 LLM Planner 塞进 MCP runtime。
3. 把 `ENABLED_TOOLS` / `DISABLED_TOOLS`、`fasm doctor`、health/capabilities
   Resource 和 provider mode 组成一条清晰 onboarding 路径。
4. 继续利用官方 Registry 优势，再评估目录、客户端安装模板和 Docker；所有外部分发
   仍单独授权。

### P1：完成真实对照评测

使用现有 external importer 和 pooling 合同，选择至少三种不同类型的对照：

- Open-WebSearch 或 OneSearch：本地零 Key；
- DDGS：成熟元搜索；
- Tavily、Exa 或 Brave：托管 Agent Search API。

使用同一 query set，保留零结果和失败，完成两模型家族盲评与第三家族分歧裁决。
完成前只发布 failure transparency、Token 或协议合同证据，不发布质量胜负。

### P2：只在需求证据出现后扩宽工具面

以下方向暂不建议为了追竞品而做：

- 独立新闻、图片、视频工具；
- Playwright/Chromium 默认依赖；
- crawl/map/interact；
- 内置深度研究 Agent；
- 由项目方托管的匿名 remote MCP。

它们会增加依赖、合规、滥用、成本和测试面，却不能强化当前最深的 evidence interface。

## 推荐的下一轮实施顺序

```text
定位和元数据收敛
  -> Evidence Demo
  -> Agent Search Skill / onboarding
  -> 外部 pooled comparison
  -> 根据真实采用和评测决定是否扩工具面
```

下一轮最小可交付不需要新 Provider，也不需要修改 MCP 输入签名。它应让用户在一分钟内
看到：Agent Search 返回的不只是搜索结果，而是一份可以继续决策的搜索证据包。

## 主要来源

### 固定源码

- Agent Search MCP：
  [`0221691`](https://github.com/lennney/agent-search-mcp/tree/0221691c157cfe2d42a4cbc70e50d1259f953ec5)
- Open-WebSearch：
  [`3f36330`](https://github.com/Aas-ee/open-webSearch/tree/3f36330dfba873d66c52116d8c8334aaf65137f4)
- DDGS：
  [`a12929a`](https://github.com/deedy5/ddgs/tree/a12929a72429a39a0841c3d7caacb20ee17acd4d)
- OneSearch MCP：
  [`16eb424`](https://github.com/yokingma/one-search-mcp/tree/16eb424608888949165f6a668d476cbdf79afc20)

### 官方产品页与仓库

- [Tavily MCP](https://github.com/tavily-ai/tavily-mcp)
- [Tavily pricing](https://www.tavily.com/pricing)
- [Exa MCP](https://github.com/exa-labs/exa-mcp-server)
- [Exa pricing](https://exa.ai/pricing?tab=api)
- [Brave Search MCP](https://github.com/brave/brave-search-mcp-server)
- [Brave Search API](https://brave.com/search/api/)
- [Firecrawl MCP](https://github.com/firecrawl/firecrawl-mcp-server)
- [Firecrawl keyless announcement](https://www.firecrawl.dev/blog/firecrawl-keyless-launch)
- [Firecrawl pricing](https://www.firecrawl.dev/pricing)
- [Jina MCP](https://github.com/jina-ai/MCP)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/)
