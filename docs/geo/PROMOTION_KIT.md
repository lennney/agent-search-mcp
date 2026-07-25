# Agent Search MCP — Promotion Kit

Updated: 2026-07-25

## Positioning

**Category:** Agent Search Router / Agent 搜索控制层

**Primary hook (EN):** Free, token-efficient web search for AI agents.

**Primary hook (ZH):** 给 AI Agent 的免费、省 Token 网页搜索。

**Mechanism:** A local-first search router: zero-key start, Chinese-native routing, inspectable multi-source evidence, token-aware stopping, and optional commercial escalation.

**Best audience:** Claude Code, Cursor, Codex, and other MCP users who want a local search path without creating an API account first.

## The distinctive route

Lead with **free + token-efficient**. Use the control loop to explain why the promise is credible and distinctive:

1. **Start free:** useful search before account creation or API procurement.
2. **Route by context:** Chinese queries go to Chinese-native sources instead of a translation shim.
3. **Return evidence, not a black-box answer:** expose `relevance`, `confidence`, `source_count`, URLs, and source provenance.
4. **Spend context progressively:** waterfall stopping and compact output keep search inside the agent's token budget.
5. **Escalate, do not lock in:** Brave/Tavily/Exa/You.com are optional higher-cost routes, not mandatory foundations.

The product is the routing policy and evidence contract. Adapters are replaceable supply.

**Do not position as:** a cheaper Tavily, a better Exa index, a fully offline search engine, or a hosted Crawl/Map platform.

**Proof points safe to publish:**

- `npx agent-search-mcp` starts the stdio server on Node.js 18+.
- 12 adapters are included; 8 require no credentials and 4 use optional API keys.
- All 12 adapters are selectable from MCP, CLI, and waterfall routing; eight require no credentials and four use optional API keys.
- Native Sogou and Baidu adapters support Chinese-web discovery.
- 510 Vitest tests pass on the 2026-07-25 audit baseline.
- stdio and Streamable HTTP transports are implemented.

## Claim boundaries

- Scope exact figures: the historical 30-query 2026-07-24 run measured 28.7% Compact, 35.5% Compact+, and 75% fewer calls than naive eight-engine fan-out. Do not present them as universal guarantees.
- The frozen formatting fixture currently reproduces 30.2% / 33.9% savings with locked `gpt-tokenizer`; do not use it as a search-quality claim.
- Monthly savings comparisons or “competitors cannot self-host.”
- Treating `confidence` as a count of independent verifying sources; use `source_count` for that.
- Presenting the historical 30-query report as a cross-product quality ranking.

## GitHub / directory description

> Free, token-efficient web search for AI agents: eight zero-key sources, token-aware waterfall search, Chinese-native routing, inspectable evidence, and optional commercial escalation.

## Reddit / Hacker News

**Title**

> Agent Search MCP: free, token-efficient web search for Claude Code, Cursor and Codex

**Body**

> I built an Apache-2.0 MCP search server around two practical goals: search without paying for an API, and spend fewer context tokens without blindly discarding evidence.
>
> `npx agent-search-mcp` starts a local stdio server. It begins with eight zero-key routes, sends Chinese queries to native Chinese sources, exposes relevance/confidence/source provenance, stops progressively to control token use, and escalates to Brave/Tavily/Exa/You.com only when configured.
>
> This is not positioned as a replacement for hosted crawl/research products. Tavily, Exa, Brave, and Firecrawl are stronger when you need hosted endpoints, Crawl/Map, vertical search, or an SLA. The niche here is zero-key local setup, Chinese-web coverage, and upstream choice.
>
> The historical 30-query run measured 28.7% fewer tokens in Compact mode, 35.5% in Compact+, and 75% fewer engine calls than naive eight-engine fan-out. Those are environment-scoped measurements, not guarantees. A new frozen-fixture replay with a locked tokenizer reproducibly measures 30.2% / 33.9% formatting savings.
>
> GitHub: https://github.com/lennney/agent-search-mcp
>
> Feedback I especially want: failing queries, Windows setup issues, and whether the tool surface should expose all adapters directly or keep a smaller default set.

## V2EX

**标题**

> [开源] Agent Search MCP：免费起步，还能节省 Token 的 Agent 搜索

**正文**

> 做了一个给 Claude Code / Cursor / Codex 用的 MCP 搜索，就解决两个直接问题：不买搜索 API 也能先搜，返回结果时少花 token。底层用路由、瀑布停止和渐进披露做到，不是简单把结果砍掉。`npx agent-search-mcp` 就能启动。
>
> 目前重点不是替代 Tavily/Exa/Brave，而是补一个本地、零密钥、中文友好的选择。包内有搜狗、百度等零密钥适配器，也可以选择性接 Brave/Tavily/Exa/You.com。
>
> 这轮刚修了 DDG 无 Python 时的 HTML fallback、stdio 日志污染、CSDN SSRF 和 Windows 构建；510 项测试通过。
>
> 历史 30 查询实测中，Compact 节省 28.7% token，Compact+ 节省 35.5%，瀑布调用数相比 8 引擎全并发少 75%。这些数字限定于当时查询集和环境，不是通用保证；新的冻结 fixture 可稳定回放 30.2% / 33.9% 的格式化节省。欢迎用真实失败查询来打脸，比 Star 更有价值。
>
> https://github.com/lennney/agent-search-mcp

## Discord / Slack showcase

> 🔎 **Agent Search MCP** — zero-key web search for MCP clients, with native Sogou/Baidu sources, multi-engine aggregation, optional commercial backends, news, and extraction. Runs locally with `npx agent-search-mcp`. Apache-2.0: https://github.com/lennney/agent-search-mcp

## Dev.to article outline

1. Why “search before signup” is a useful MCP product boundary.
2. One-minute configuration for Claude Code, Cursor, and Codex.
3. Native Chinese sources versus translated queries.
4. Multi-engine orchestration and graceful fallback.
5. Compact output and progressive disclosure.
6. Honest limits: no managed hosted endpoint, no Crawl/Map, no labeled retrieval-quality benchmark.
7. Reliability work: stdio safety, HTTP Bearer/Origin protection, SSRF protection, Windows build.
8. Evidence: scoped historical measurements plus reproducible frozen-fixture regression.

## Distribution priority

1. Merge and publish the hardening changes; let CI verify Linux and Windows.
2. Refresh GitHub description and directory metadata with the one-line positioning.
3. Publish the revised Juejin article.
4. Post the short Reddit/V2EX variants and collect failing-query examples.
5. Submit to remaining directories only after their listing can link to the current release and CI state.
