# Agent Search MCP — Promotion Kit

Updated: 2026-07-25

## Positioning

**One line:** Zero-key MCP web search with native Chinese sources, multi-engine aggregation, optional commercial backends, news, and extraction.

**Best audience:** Claude Code, Cursor, Codex, and other MCP users who want a local search path without creating an API account first.

**Proof points safe to publish:**

- `npx agent-search-mcp` starts the stdio server on Node.js 18+.
- 12 adapters are included; 8 require no credentials and 4 use optional API keys.
- The current `free_search`/CLI surface routes 8 adapters; four additional adapters await unified routing.
- Native Sogou and Baidu adapters support Chinese-web discovery.
- 498 Vitest tests pass on the 2026-07-25 audit baseline.
- stdio and Streamable HTTP transports are implemented.

## Claims to avoid until the next benchmark release

- Exact “75% fewer engine calls” or “28.7% fewer tokens” claims.
- “All 12 engines are selectable everywhere.”
- Monthly savings comparisons or “competitors cannot self-host.”
- Treating the current confidence value as a count of independent verifying sources.
- Presenting the historical 30-query report as a cross-product quality ranking.

## GitHub / directory description

> Zero-key MCP web search for AI agents: native Chinese sources, multi-engine aggregation, optional Brave/Tavily/Exa/You.com, news, extraction, and Streamable HTTP.

## Reddit / Hacker News

**Title**

> Agent Search MCP: zero-key, multi-engine web search for Claude Code, Cursor and Codex

**Body**

> I built an Apache-2.0 MCP server for people who want web search before creating another API account.
>
> `npx agent-search-mcp` starts a local stdio server. The project includes native Sogou/Baidu search, multi-engine aggregation, optional Brave/Tavily/Exa/You.com backends, news search, and page extraction.
>
> This is not positioned as a replacement for hosted crawl/research products. Tavily, Exa, Brave, and Firecrawl are stronger when you need hosted endpoints, Crawl/Map, vertical search, or an SLA. The niche here is zero-key local setup, Chinese-web coverage, and upstream choice.
>
> I also audited the marketing claims before posting: the old benchmark is now labeled exploratory, and exact token/engine-call savings have been removed until telemetry is reproducible.
>
> GitHub: https://github.com/lennney/agent-search-mcp
>
> Feedback I especially want: failing queries, Windows setup issues, and whether the tool surface should expose all adapters directly or keep a smaller default set.

## V2EX

**标题**

> [开源] Agent Search MCP：零密钥起步，支持中文来源和多引擎聚合

**正文**

> 做了一个给 Claude Code / Cursor / Codex 用的 MCP 搜索服务器：`npx agent-search-mcp` 就能启动，不注册账号也能先搜。
>
> 目前重点不是替代 Tavily/Exa/Brave，而是补一个本地、零密钥、中文友好的选择。包内有搜狗、百度等零密钥适配器，也可以选择性接 Brave/Tavily/Exa/You.com。
>
> 这轮刚修了 DDG 无 Python 时的 HTML fallback、stdio 日志污染、CSDN SSRF 和 Windows 构建；498 项测试通过。
>
> 旧 benchmark 的精确节省比例暂时撤下了，因为遥测还不足以支撑强结论。欢迎用真实失败查询来打脸，比 Star 更有价值。
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
6. Honest limits: no hosted endpoint, no Crawl/Map, incomplete adapter routing.
7. Reliability work: stdio safety, SSRF protection, Windows build.
8. Roadmap: unified routing, benchmark telemetry, confidence/source-count contract.

## Distribution priority

1. Merge and publish the hardening changes; let CI verify Linux and Windows.
2. Refresh GitHub description and directory metadata with the one-line positioning.
3. Publish the revised Juejin article.
4. Post the short Reddit/V2EX variants and collect failing-query examples.
5. Submit to remaining directories only after their listing can link to the current release and CI state.
