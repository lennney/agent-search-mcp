---
type: Readme
title: Agent Search MCP — 11 引擎统一搜索 MCP Server
timestamp: '2026-07-24T09:30:00+08:00'
description: 11 搜索引擎（8 免费），MCP 协议接入，零 API key，中文搜索，多源验证
tags:
- agent-search-mcp
- readme
- mcp
- search
---

# Agent Search MCP

> 🔍 **11 search engines (8 free), one MCP server.** Zero API keys. Chinese search. Multi-source verification. Waterfall progressive search, content extraction, news & CLI. `npm install` is enough.

[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![GitHub stars](https://img.shields.io/github/stars/lennney/agent-search-mcp)](https://github.com/lennney/agent-search-mcp/stargazers)
[![CI](https://github.com/lennney/agent-search-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lennney/agent-search-mcp/actions)
[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![Tests](https://img.shields.io/badge/tests-463%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)
|![Glama](https://glama.ai/mcp/servers/lennney/agent-search-mcp/badges/score.svg)](https://glama.ai/mcp/servers/lennney/agent-search-mcp)

**Works with Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex, Hermes, and any MCP-compatible client.**

> ⭐ **[Star on GitHub](https://github.com/lennney/agent-search-mcp)** — it helps others discover the project!

## Project Snapshot

| | |
|---|---|
| **Engines** | 11 (8 free, no API key) |
| **MCP Tools** | 8 (search, news, extract, fetch) |
| **Transports** | stdio + Streamable HTTP |
| **Latest version** | [v3.1.3](https://www.npmjs.com/package/agent-search-mcp) |
| **Tests** | 463 passing |
| **Install** | `npx agent-search-mcp` |
| **MCP Registry** | `io.github.lennney/agent-search-mcp` |

[Benchmarks →](./benchmarks/) — 100% success rate across 30 queries, 100% waterfall efficiency.

[English](#quick-start) · [中文](README_zh.md) · [Tools](#tools) · [CLI](#cli) · [Engines](#engines) · [Config](#configuration)

---

## Quick Start

### Prerequisites

- **Node.js >= 18** — that's it. No Python, no API keys, no Docker required.

### Install

```bash
# npx (no install)
npx agent-search-mcp

# Global install
npm install -g agent-search-mcp
```

### Configure Your Client

<details>
<summary><b>Claude Code</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>VS Code / Cline / Roo Code</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
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
      "args": ["agent-search-mcp"]
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
    args: ["agent-search-mcp"]
```
</details>

<details>
<summary><b>Codex</b></summary>

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

---

## Why Agent Search MCP

**AI agents need to search the web. But existing options have problems:**

| Solution | Price | The Catch |
|----------|-------|------------|
| Tavily | $0.01/search | Monthly cost: $20-50+ |
| Exa | $50/mo | Powerful semantic search, but expensive |
| Brave Search | $3/1K after 2K free | Free quota runs out fast |
| DDG MCP | Free | Single source, no verification, results vary |
| Serper | $0.30/1K | Google SERP, no content extraction |

**Agent Search MCP is different:**

| Capability | Why It Matters |
|------------|----------------|
| **8 free engines, zero API keys** | DuckDuckGo, Sogou, Bing, Baidu, Wikipedia, Startpage, Yandex, Mojeek — all work out of the box |
| **Waterfall progressive search** | Runs engines in confidence-gated phases. Stops early when results are sufficient — saves 50-75% calls |
| **Multi-source verification** | Cross-checks results across engines. Each result scored 1-3 based on how many sources agree |
| **Chinese search** | Sogou + Baidu for native Chinese web search. Not a translation layer |
| **Content enrichment** | Auto-extracts full page content for low-confidence results via Jina Reader |
| **MCP 2025 compliant** | Streamable HTTP transport, `readOnlyHint`/`idempotentHint` annotations, explicit capabilities |
| **Token optimized** | Smart truncation + dedup saves ~40-50% tokens vs raw search |
| **Self-hostable** | No third-party data sharing. Run on your own VPS |
| **Security built-in** | SSRF protection, prompt injection detection, URL validation |

---

## Engines

| Engine | Free | Strengths |
|--------|:----:|-----------|
| **DuckDuckGo** | ✅ | Privacy-focused, English web. Python ddgs preferred, cheerio HTML fallback |
| **Sogou** | ✅ | Chinese web search, WeChat content |
| **Bing** | ✅ | Multilingual, strong English results |
| **Baidu** | ✅ | Chinese web search, Baidu Baike |
| **Wikipedia** | ✅ | Clean JSON API, structured knowledge |
| **Startpage** | ✅ | Google results via privacy proxy |
| **Yandex** | ✅ | Russian web search |
| **Mojeek** | ✅ | Independent crawler, privacy-focused |
| Brave Search | ❌ | High-quality web results, 2K free/month |
| Tavily | ❌ | Agent-optimized search, 1K free/month |
| Exa | ❌ | Neural semantic search, 1K free/month |

---

## Tools

| Tool | Description | Best For |
|------|-------------|----------|
| `free_search` | Multi-engine search with auto-fallback | Quick fact-finding, general queries |
| `free_search_advanced` | Filtered search with waterfall, domain filtering, enrichment | High-confidence results, date ranges, domain filtering |
| `free_search_news` | News search across DDG News + Bing News | Recent news, current events |
| `search_with_synthesis` | Deep search with `prompt_hint` for LLM synthesis | Complex queries needing multi-source verification |
| `free_extract` | Extract full page content as Markdown | Reading a specific page from search results |
| `fetch_github_readme` | Fetch README from a GitHub repo | Quick project documentation |
| `fetch_csdn_article` | Fetch content from CSDN blog | Chinese developer articles |
| `fetch_juejin_article` | Fetch content from Juejin | Chinese developer articles |

**Quick reference:** `free_search`, `free_search_advanced`, `free_search_news`, `search_with_synthesis`, `free_extract`, `fetch_github_readme`, `fetch_csdn_article`, `fetch_juejin_article`

All tools are read-only and idempotent with MCP 2025 annotations.

### Key Features

**Waterfall Search** (3 phases, confidence-gated):
1. Phase 1: DDG + Sogou → check confidence
2. Phase 2: Bing + Baidu → check
3. Phase 3: Brave + Tavily + Exa (paid only)

Stops as soon as results are sufficient. Saves 50-75% engine calls.

**Confidence Scoring** (1-3):
- **1**: Single source
- **2**: Verified by 2+ sources (recommended)
- **3**: Highly verified by 3+ sources

**Structured Errors**: Engine failures return typed errors (`timeout`, `rate_limited`, `permission_denied`, etc.) with actionable suggestions — agents can self-recover.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAVE_API_KEY` | — | Brave Search API key (2K free/month) |
| `TAVILY_API_KEY` | — | Tavily API key (1K free/month) |
| `EXA_API_KEY` | — | Exa API key (1K free/month) |
| `LOG_LEVEL` | `info` | Log level: `info`, `debug` |
| `MODE` | `stdio` | Transport: `stdio`, `http`, `both` |
| `PORT` | `3000` | HTTP server port (MODE=http/both) |
| `OUTPUT_STYLE` | `normal` | `compact` for token-optimized output |
| `SNIPPET_LENGTH` | `200` | Max snippet chars (60-500) |
| `MAX_FULL_RESULTS` | `3` | Full results before compacting (compact mode, 0-20) |
| `MIN_CONFIDENCE` | `0` | Confidence threshold filter (compact mode, 0.0-3.0) |

**Zero config works** — no API keys needed for the 8 free engines.

### Tool Visibility

Control which tools your agent can see:

```bash
# Only search tools
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news

# Disable specific tools
DISABLED_TOOLS=free_extract,fetch_github_readme

# Enable only one fetch tool
ENABLED_TOOLS=fetch_csdn_article
```

| Variable | Description |
|----------|-------------|
| `ENABLED_TOOLS` | Comma-separated list of tools to enable. If set, only these are registered |
| `DISABLED_TOOLS` | Comma-separated list of tools to disable. Takes priority over `ENABLED_TOOLS` |

### Engine Filtering

```bash
# Only use Chinese engines
ALLOWED_ENGINES=sogou,baidu

# Exclude specific engines
DENIED_ENGINES=yandex,mojeek
```

---

## CLI

`agent-search-mcp` also works as a standalone CLI tool (`fasm`).

```bash
# Search
fasm search "TypeScript MCP server"
fasm search "query" --count 5 --engines bing,baidu --json

# Extract
fasm extract "https://example.com"
fasm extract "https://example.com" --json

# HTTP server
fasm serve --port 8080
```

---

## Architecture

```
Agent (Claude Code, Cursor, etc.)
  ↓ MCP Protocol (stdio / Streamable HTTP)
MCP Server
  ├── Tools Layer
  │   ├── free_search / free_search_advanced / free_search_news
  │   ├── search_with_synthesis
  │   ├── free_extract
  │   └── fetch_github_readme / fetch_csdn_article / fetch_juejin_article
  ├── Aggregation Layer
  │   ├── Waterfall Search (3-phase confidence-gated)
  │   ├── Cross-Engine Scoring (frequency + domain authority)
  │   ├── Dedup (URL + title)
  │   ├── Content Enrichment (Jina Reader)
  │   └── Query Expansion (rule-based, 4 strategies)
  ├── Engine Layer (11 engines)
  │   ├── Free: DDG, Sogou, Bing, Baidu, Wikipedia, Startpage, Yandex, Mojeek
  │   └── Paid: Brave, Tavily, Exa
  └── Infrastructure
      ├── Health Tracker (per-engine circuit breaking)
      ├── Rate Limiter (adaptive concurrency)
      ├── Cache (LRU, 60s TTL, 1000 entries)
      ├── SSRF Protection (URL validation)
      └── Security (injection detection, boundary markers)
```

---

## Development

```bash
git clone https://github.com/lennney/agent-search-mcp.git
cd agent-search-mcp
npm install
npm run build
npm test          # 448 tests, 40 files
npm run dev       # stdio mode
npm run dev:http  # HTTP mode (port 3000)
```

## Benchmarks

Agent Search MCP achieved **100% success rate** across 30 diverse queries (EN + ZH), with **every query satisfied at phase 1** of the waterfall (2 engines only — no fallthrough to phase 2 or 3 needed).

| Metric | Result |
|--------|--------|
| Success rate | **30/30 (100%)** |
| Waterfall efficiency | **100%** stopped at phase 1 |
| Avg engines per query | **2.0** |
| Avg confidence | 0.64 / 1.0 |

→ [Full benchmark report & methodology](benchmarks/)

---

## Companion Tools

**🛡️ [mcp-slim-guard](https://github.com/lennney/mcp-slim-guard)** — Add security + compression to your MCP stack

```bash
npm install -g mcp-slim-guard
mcp-slim-guard init
mcp-slim-guard start
```

Pair agent-search-mcp with mcp-slim-guard to get:

| Feature | Benefit |
|---------|---------|
| **Schema compression** | Reclaim ~83% of context window — 1,736 → 300 tokens |
| **Tool allow/deny** | Glob-based whitelist/blacklist for tool access control |
| **SSRF protection** | IP blacklist + domain whitelist blocks internal network requests |
| **Injection detection** | 17 heuristic patterns prevent prompt/shell/SQL injection |
| **Rate limiting** | Token bucket per-tool, default 60 req/min |
| **Audit logging** | Structured JSON audit log with rotation + gzip |

```
AI Agent → mcp-slim-guard (security + compression) → agent-search-mcp
```

---

## License

[MIT](LICENSE)