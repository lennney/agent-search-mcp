# Agent Search MCP

> **12 search engines (8 free, zero API keys), one MCP server.**
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

Most MCP search servers wrap a single paid API — one engine, one bill. Agent Search MCP is built differently.

| | Agent Search MCP | Tavily | Exa | Brave |
|---|:---:|:---:|:---:|:---:|
| **Price** | **$0** | ~$30/mo | $50/mo | ~$15/mo |
| **Free engines** | **8** | 0 | 0 | 1 (2K/mo cap) |
| **API key required** | No | Yes | Yes | Yes |
| **Multi-source verify** | ✅ 8 engines | ❌ | ❌ | ❌ |
| **Chinese search** | ✅ Sogou+Baidu | ❌ | ❌ | ❌ |
| **Self-hosted** | ✅ | ❌ | ❌ | ❌ |

### Free, forever

8 engines work with zero configuration — DuckDuckGo, Sogou, Bing, Baidu, Wikipedia, Startpage, Yandex, Mojeek. No API keys, no signup, no credit card. At 100 searches/day, that saves $30–50/month vs paid alternatives.

### 75% fewer engine calls

Benchmarked on [30 diverse queries](./benchmarks/) (15 English + 15 Chinese): **100% satisfied at waterfall phase 1** with just 2 engines. A naive multi-search would call all 8 every time. The waterfall stops early when confidence is sufficient — fewer calls, less latency, less data fed to the LLM.

### Multi-source verification

DDG and Sogou return **zero-overlap result sets** — you get genuinely broader coverage than any single engine can provide. Each result is scored 1–3 based on how many sources agree. Confidence-2+ results have been cross-checked by multiple engines.

### Token-efficient architecture

Two layers of savings, benchmarked on 30 EN+ZH queries:
- **Waterfall stops early** → 2 engines instead of 8 → **75% fewer engine calls**
- **Compact mode** → strips metadata noise + progressive disclosure → **28.7% fewer tokens** (1582 → 1128)
- **Compact Aggressive** (`SNIPPET_LENGTH=120`) → **35.5% fewer tokens** (1582 → 1020)

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

Benchmarked on [30 queries](./benchmarks/queries.json) (15 EN + 15 ZH, covering tech, news, and general knowledge) with default config, no API keys.

| Metric | Result |
|--------|--------|
| **Success rate** | **30/30 (100%)** |
| **Waterfall efficiency** | **100%** stopped at phase 1 |
| **Avg engines per query** | **2.0** (vs 8 in naive = **75% fewer calls**) |
| **Multi-source diversity** | **0% URL overlap** DDG vs Sogou |
| **Avg confidence** | 0.64 / 1.0 |
| **Avg latency** | 15.2s (P50: 14.8s, P95: 18.4s) |
| **Token savings (compact)** | **28.7%** (1582 → 1128 tokens) |
| **Token savings (aggressive)** | **35.5%** (1582 → 1020 tokens) |

→ [Full methodology & reports](./benchmarks/)

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

---

## License

[Apache 2.0](LICENSE)

Based on [open-websearch](https://github.com/Aas-ee/open-websearch) by Aas-ee.
