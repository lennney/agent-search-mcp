# Agent Search MCP 竞品格局增量调研（2026-08-10）

日期：2026-08-10

## 调研结论

上次竞品调研（2026-08-07）判断"免费/无 Key/多引擎"已是拥挤 baseline，真正有防御力的是
**Search Evidence Router** 定位。三周内的新调研（2026-08-10，三路并行：直接本地竞品、
Python 元搜索生态、托管服务与新进入者）印证并强化了这一判断：

1. **直接本地竞品进入休眠，证据合同无人占据。** Open-WebSearch 最后一次代码 push 是
   2026-05-16，聚合去重/融合的 roadmap（issue #96-98）仍开放；OneSearch 停在
   v1.2.4（07-31）；DDGS 休眠约 2.5 个月。它们要么吞掉失败（DDGS MCP、mcp-web-hound）、
   要么没有聚合（OneSearch 单 provider）、要么根本没有 MCP（SearXNG，最活跃却只提供
   常被 403 的 JSON API）。Agent Search 的 `provider-family + partialFailures +
   quality-gate + budget + structuredContent` 组合在本地零 Key MCP 赛道仍无对标。
2. **"免费/无 Key"从差异化降级为入场券。** Tavily（6 月）、Exa（7 月）、Firecrawl 全部
   提供 keyless 入口；remote+OAuth 是托管侧迁移方向。免费本身不再能作为主卖点。
3. **行业新共识 = context engineering。** 搜索工具 UX 共识收敛到"渐进发现、按需细节、
   小工具面、Token 高效的搜索输出"（Vellum：context engineering 约等于 agentic search
   的 80%）。TinySearch（2026-05）已用"up to 95% token reduction + evidence packets"
   直接撞 Agent Search 的"省 Token + 证据"叙事，但它没有 provider-family、双语路由
   和深度失败合同。

## 直接本地竞品（2026-08-10 核对）

| 项目 | 活跃度 | 新增/变化 | 对 Agent Search 的压力 | 仍未覆盖的 Agent Search 核心 |
|---|---|---|---|---|
| Open-WebSearch | 休眠（最后 push 05-16；08-03 仅 docs sponsor） | v2.1.9 release 是 04-30；2.1.10/2.1.11 从未 cut；主页 mcp 页已 402 paywall | 分发和 Skill/daemon/Docker 叙事仍领先 | 无 provider dedup/fusion（roadmap #96-98 开放）、无质量门、失败不透明（Exa 死端点 #91、Baidu TLS #94、Bing 301 #95） |
| OneSearch | 停在 v1.2.4（07-31） | 仅 You.com provider 与 DDG safeSearch 修正 | 浏览器自动化套件（scrape/截图/executeJavascript）+ Docker/Chromium | 单 provider 一次请求、无聚合/证据/质量门、无 remote transport |
| DDGS | 休眠约 2.5 个月（最后 commit 05-23） | 转向 `primp` TLS 模仿、加 Startpage 引擎；MCP 基于官方 SDK | 免费面宽、垂直工具多、Python 采用成本低 | MCP 每个工具打单一后端；无聚合/evidence/质量门；英文为主 |
| SearXNG | 活跃（35.2k★、274 引擎、08-07 仍在推） | 2026 新增 Kagi/s1search/chatnoir/Exa/keenable/google_cse 等；删 reddit/presearch | 引擎广度与自托管是强 baseline | **无 MCP**；JSON API 常 403；输出 raw、无质量门、去重仅 URL |
| mcp-web-hound | 年轻项目（06-25 创建，07-04 后安静） | 8 provider 三层路由、缓存/rerank/限流、status 工具 | 精神最接近（agent-first 多 provider） | 失败被 fallback 静默吞掉、relevance 不透明、无 quality-gate、无 structured partialFailures、无双语 |

## 托管服务与新进入者（2026-06 ~ 08）

### 托管侧变化

- **Keyless 扩散**：Tavily（6 月 keyless Search/Extract + x402 加密支付）、Exa
  （未认证免费层 3 QPS / 150 次每天）、Firecrawl（keyless search/scrape/parse）。
- **remote + OAuth 是迁移方向**：Tavily/Exa/Firecrawl/Jina 均支持 remote+OAuth；
  Brave 是落后项（"add remote MCP" issue 仍开放）。这与 Agent Search 的自托管本地
  模型不同，不应被追平。
- **深度研究工具化**：Tavily `/research`、Exa Agent、Firecrawl agent/research。

### 新进入者

| 项目 | 时间 | 卖点 | 与 Agent Search 的关系 |
|---|---|---|---|
| TinySearch | 2026-05 | "up to 95% token reduction"、本地 crawl/rerank、evidence packets | 直接撞"省 Token + 证据"叙事；但它无 provider-family/双语/失败合同 |
| AutoSearch | 2026-03 | 40 渠道 deep research，含 10+ 中文源（微信/小红书/微博/知乎/36kr）；显式 "Tavily-alternative" | 中文面更宽；但靠渠道数量，非原生双语路由 |
| free-search-mcp | 2026-04 | 无 Key 多引擎 + 垂直路由（arxiv/github/HN/GDELT/openverse/zenodo） | 垂直分类路由值得借鉴 |
| mrkrsl/web-search-mcp | 活跃 | 本地 TS、Bing>Brave>DDG + Playwright 回退、整页提取 | 浏览器回退是多家可靠性杠杆，但 Agent Search 刻意不做 |

### 生态趋势

- Registry 规模 18,849 个 server，~50% 广告 remote，~90% 仍 stdio-local。
- 搜索 UX 共识：`search_tools` 渐进发现、按需细节、Token 高效输出、好错误字符串。
- 认证基线：~47% 无认证 / ~43% API key / ~10% OAuth。

## 定位再收敛

> **Token-efficient, inspectable search for local agents — free-first bilingual (EN/ZH) routing, bounded fallback, and search evidence an agent can audit.**

差异三支柱：

1. **可审计的搜索证据**（不是输出压缩）：provider-family 独立来源计数、`partialFailures`
   失败类型、质量门停止原因、共享预算耗尽原因、canonical `structuredContent`。
2. **双语原生路由**：Sogou/Baidu 无翻译层、中文 query variants、CSDN/掘金内容路径。
   这是"支持中文"与"中文原生"的差别，AutoSearch 用渠道数量、我们用水位质量。
3. **省 Token 的 context engineering**：实测 28-30% 削减 + 共享证据预算，行业刚刚
   验证的方向。TinySearch 只做压缩，我们没有丢失 provenance。

**明确不做**（调研强化边界）：浏览器自动化/Chromium-Docker（OneSearch 模式）、
托管 remote OAuth（托管商业模式）、deep-research LLM planner（`search_with_synthesis`
已是零 LLM 轻研究）。

## 提升优先级

| 优先级 | 事项 | 依据 |
|---|---|---|
| P0 | README 首屏"普通聚合 vs Agent Search 证据"对照 + `demo:evidence` 前移 | 08-07 报告最后未关的 P0；竞品休眠期正是收敛产品故事的窗口 |
| P0 | 把"省 Token"从表格提升到标题叙事（实测 28-30% + 共享证据预算） | 行业新共识，能力已实现只差宣传 |
| P1 | 干净 runner 上的外部 pooled 对照（Open-WebSearch + 一个托管如 Tavily） | 唯一能解锁质量声明的门禁；仍是最大信用缺口 |
| P2 | 可选垂直路由（code/docs/研究/中文技术）对抗 free-search-mcp/AutoSearch | 有需求证据再做，"只做有必要的" |
| P2 | Docker + 本地 HTTP daemon（Open-WebSearch 分发优势） | 提升自托管故事 |
| P2 | `search_tools` 渐进发现 meta-tool | 生态基线；工具面小，价值存疑 |

## 主要来源

调研日期 2026-08-10，通过 GitHub API、官方 README、npm registry、docs 与 issue 核对。
变更项以来源日期/commit 为准：

- Open-WebSearch：`github.com/Aas-ee/openWebSearch`（commit 2026-08-03 为 docs sponsor，
  最后代码 push 2026-05-16，release v2.1.9 = 2026-04-30；issue #91/#94/#95/#96-98）
- OneSearch：`github.com/yokingma/one-search-mcp`（v1.2.4 = 2026-07-31）
- DDGS：`github.com/deedy5/ddgs`（v9.14.4 = 2026-05-15；`primp>=1.2.3`）
- SearXNG：`github.com/searxng/searxng`（docs 2026.8.4；引擎 PR #6186/#6364/#6369）
- mcp-web-hound：`github.com/ilgizar-valiullin/mcp-web-hound`（v1.10.3 = 2026-07-04）
- Tavily MCP / Tavily June changelog / Exa MCP / Brave MCP / Firecrawl MCP / Jina MCP：
  官方仓库与 pricing/changelog 页
- 生态数据：mcptrove.com/report、mcpqueen.com、archestra.ai/blog/state-of-mcp-2026、
  Vellum "context engineering ~80% agentic search"（2026-06-30）、
  AWS MCP tool-design post（2026-07-09）

上一份完整竞品格局：`docs/research/2026-08-07-competitive-landscape-and-product-gaps.md`。
