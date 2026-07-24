# Agent Search MCP

> **12 search adapters (8 zero-key), one MCP server.**
> Chinese search via Sogou + Baidu. Multi-source verification with confidence scoring. Waterfall progressive search. Content extraction. `npx agent-search-mcp` is all you need.

[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![GitHub stars](https://img.shields.io/github/stars/lennney/agent-search-mcp)](https://github.com/lennney/agent-search-mcp/stargazers)
[![CI](https://github.com/lennney/agent-search-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lennney/agent-search-mcp/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Glama](https://glama.ai/mcp/servers/lennney/agent-search-mcp/badges/score.svg)](https://glama.ai/mcp/servers/lennney/agent-search-mcp)

[中文文档](README_zh.md) · [Benchmarks](./benchmarks/) · [CHANGELOG](./CHANGELOG.md)

---

## Why Agent Search MCP

Most MCP search servers expose one commercial search backend. Agent Search MCP focuses on a different job: a local, zero-key path that can aggregate multiple public engines and search the Chinese web directly.

| | Agent Search MCP | [Tavily](https://github.com/tavily-ai/tavily-mcp) | [Exa](https://github.com/exa-labs/exa-mcp-server) | [Brave](https://github.com/brave/brave-search-mcp-server) |
|---|:---:|:---:|:---:|:---:|
| **Search without account/API key** | **Yes** | No | No | No |
| **Search backends** | **8 zero-key + 4 optional APIs** | Tavily API | Exa index | Brave index |
| **Cross-engine aggregation** | **Yes** | Single upstream | Single upstream | Single upstream |
| **Dedicated Chinese engines** | **Sogou + Baidu** | No | No | No |
| **Local MCP server** | Yes | Yes | Yes | Yes |
| **Best fit** | Zero-key, multilingual verification | Hosted search/extract/map/crawl | Semantic, code, and company research | Independent index + vertical search |

Comparison last checked 2026-07-25 against the linked official repositories. Commercial services have useful free allowances, but still require an account or credential; pricing changes, so this table intentionally avoids monthly-price claims.

### Zero-key by default

Eight adapters need no credentials — DuckDuckGo, Sogou, Bing, Baidu, Wikipedia, Startpage, Yandex, and Mojeek. Brave, Tavily, Exa, and You.com remain optional when you want their APIs.

### Progressive multi-source search

Parallel and waterfall orchestration, URL/title deduplication, ranking, and graceful fallback are built in. Compact mode supports progressive disclosure so agents can inspect the top results first and call `free_extract` only when deeper content is needed.

### Token control is a product feature

`OUTPUT_STYLE=compact`, `MAX_FULL_RESULTS`, `SNIPPET_LENGTH`, and `MIN_CONFIDENCE` let operators trade context size against detail. The benchmark harness is being strengthened before exact savings percentages are used as release claims.

### Native Chinese search

Sogou + Baidu search the Chinese web directly — WeChat content, Baidu Baike, Chinese forums. Not a translation layer, not an afterthought.

---

## Quick Start

```bash
# One command — no install, no API keys
npx agent-search-mcp
```

Requires Node.js >= 18.

### Client Configuration

<details>
<summary><b>Claude Code / Claude Desktop</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor / VS Code / Codex</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Hermes</b></summary>

```yaml
mcp_servers:
  agent-search:
    command: npx
    args: ["-y", "agent-search-mcp"]
```
</details>

---

## Engines

The package contains 12 engine adapters. The current `free_search`/CLI routing surface exposes DuckDuckGo, Sogou, Bing, Baidu, Brave, Tavily, Exa, and You.com; the remaining adapters are not yet selectable from every entry point.

| Engine | Free | Strengths |
|--------|:----:|-----------|
| **DuckDuckGo** | ✅ | Privacy-focused, English web |
| **Sogou** | ✅ | Chinese web search, WeChat content |
| **Bing** | ✅ | Multilingual, strong English results |
| **Baidu** | ✅ | Chinese web search, Baidu Baike |
| **Wikipedia** | ✅ | Clean JSON API, structured knowledge |
| **Startpage** | ✅ | Google results via privacy proxy |
| **Yandex** | ✅ | Russian/Cyrillic web search |
| **Mojeek** | ✅ | Independent crawler, privacy-focused |
| Brave Search | ❌ | High-quality web results (2K free/month) |
| Tavily | ❌ | Agent-optimized search (1K free/month) |
| Exa | ❌ | Neural semantic search (1K free/month) |
| You.com | ❌ | AI-powered search ($5/1K, free credits available) |

---

## Tools

| Tool | Description | Best For |
|------|-------------|----------|
| `free_search` | Multi-engine search with auto-fallback | Quick fact-finding |
| `free_search_advanced` | Filtered search with waterfall, domain filtering, enrichment | High-confidence results, date ranges |
| `free_search_news` | News search across DDG News + Bing News | Recent news, current events |
| `search_with_synthesis` | Deep search with prompt hint for LLM synthesis | Complex queries needing verification |
| `free_extract` | Extract full page content as Markdown | Reading a page from search results |
| `fetch_github_readme` | Fetch README from a GitHub repo | Project documentation |
| `fetch_csdn_article` | Fetch content from CSDN | Chinese developer articles |
| `fetch_juejin_article` | Fetch content from Juejin | Chinese developer articles |

All tools are read-only and idempotent with MCP 2025 annotations.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAVE_API_KEY` | — | Brave Search API key |
| `TAVILY_API_KEY` | — | Tavily API key |
| `EXA_API_KEY` | — | Exa API key |
| `YDC_API_KEY` | — | You.com API key |
| `LOG_LEVEL` | `info` | `info` or `debug` |
| `MODE` | `stdio` | Transport: `stdio`, `http`, or `both` |
| `PORT` | `3000` | HTTP server port (when `MODE=http` or `both`) |
| `OUTPUT_STYLE` | `normal` | `compact` for token-optimized output |
| `SNIPPET_LENGTH` | `200` | Max snippet characters (60–500) |
| `MAX_FULL_RESULTS` | `3` | Full results before compacting (compact mode) |
| `MIN_CONFIDENCE` | `0` | Confidence threshold filter (0.0–3.0) |
| `SEMANTIC_DEDUP` | `false` | Semantic dedup via Model2Vec (requires `pip install model2vec`) |
| `DEDUP_THRESHOLD` | `0.85` | Cosine similarity threshold for semantic dedup |
| `SEMANTIC_RERANK` | `false` | Semantic rerank via Model2Vec |
| `RERANK_TOP_K` | `5` | Results to keep after semantic rerank |

**Zero config works** — the 8 free engines need no API keys.

### Tool Visibility

```bash
# Only specific tools
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news

# Disable specific tools
DISABLED_TOOLS=free_extract,fetch_github_readme
```

`DISABLED_TOOLS` takes priority over `ENABLED_TOOLS`.

### Engine Filtering

```bash
ALLOWED_ENGINES=sogou,baidu    # Chinese-only
DENIED_ENGINES=yandex,mojeek   # Exclude specific engines
```

---

## CLI

`agent-search-mcp` ships with a standalone CLI (`fasm`).

```bash
# Search
fasm search "TypeScript MCP server"
fasm search "query" --count 5 --engines bing,baidu,youcom --json

# Extract
fasm extract "https://example.com"
fasm extract "https://example.com" --json

# HTTP server
fasm serve --port 8080
```

---

## Benchmark

The repository includes a reproducible harness and historical reports for 30 EN/ZH queries. The current reports are an **exploratory baseline**, not a cross-product quality benchmark: token counts are estimates, most queries are technical, and engine-call telemetry is not yet sufficient to substantiate exact waterfall savings.

Use the reports to reproduce behavior and spot regressions; do not treat the historical percentages as guaranteed production savings.

→ [Methodology, queries, limitations, and reports](./benchmarks/)

---

## Companion Tools

**🛡️ [mcp-slim-guard](https://github.com/lennney/mcp-slim-guard)** — Add security + compression to your MCP stack

```bash
npm install -g mcp-slim-guard
mcp-slim-guard init
mcp-slim-guard start
```

```
AI Agent → mcp-slim-guard (security + compression) → agent-search-mcp
```

| Feature | Benefit |
|---------|---------|
| **Schema compression** | Reclaim ~83% of context window — 1,736 → 300 tokens |
| **Tool allow/deny** | Glob-based whitelist/blacklist for tool access control |
| **SSRF protection** | IP blacklist + domain whitelist blocks internal network requests |
| **Injection detection** | 17 heuristic patterns prevent prompt/shell/SQL injection |
| **Rate limiting** | Token bucket per-tool, default 60 req/min |
| **Audit logging** | Structured JSON audit log with rotation + gzip |

---

## Development

```bash
git clone https://github.com/lennney/agent-search-mcp.git
cd agent-search-mcp
npm install
npm run build
npm test
npm run dev        # stdio mode
npm run dev:http   # HTTP mode (port 3000)
```

The build helper is cross-platform; CI checks Node.js 18/20/22 on Linux and performs a Windows build smoke test.

---

## License

[Apache 2.0](LICENSE)

Based on [open-websearch](https://github.com/Aas-ee/open-websearch) by Aas-ee.
