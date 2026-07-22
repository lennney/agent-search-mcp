---
type: Readme
title: Agent Search MCP
timestamp: '2026-07-20T23:35:20+08:00'
description: 7 引擎搜索，MCP 协议接入，免费 + 多源验证 + Token 优化
tags:
- agent-search-mcp
- readme
---
# Agent Search MCP

> 🔍 **Truly free.** 11 engines, zero API keys. Chinese search (Sogou+Baidu). Multi-source verification. Agent-native. npm install is enough.

[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/tests-438%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)
[![Glama](https://glama.ai/mcp/servers/lennney/agent-search-mcp/badges/score.svg)](https://glama.ai/mcp/servers/lennney/agent-search-mcp)

**Works with Claude Code, Cursor, Windsurf, Codex, Hermes, OpenClaw, and any MCP-compatible client.**

> ⭐ **Like this project?** [Star it on GitHub](https://github.com/lennney/agent-search-mcp) — it helps others discover it! Your 1 second helps the project grow.

---

[English](#why-agent-search-mcp) · [中文](README_zh.md) · [安装](#quick-start) · [工具文档](#tools) · [竞品对比](#competitor-comparison)

---

## Why Agent Search MCP

**AI agents need to search the internet. But existing solutions have problems:**

| Solution | Price | Problem |
|----------|-------|---------|
| **Tavily** | $0.01/search | Adds up fast. Monthly cost: $20-50+. |
| **Exa** | $50/mo | Powerful semantic search, but expensive. |
| **Brave Search** | $3/1000 after 2K free | Not enough free quota for heavy use. |
| **Firecrawl** | $83/100K pages | Search + scrape combined, but costly at scale. |
| **Perplexity Sonar** | $5/1K queries + tokens | Answer engine, can't evaluate raw sources. |
| **Serper** | $0.30/1K | Google SERP, but no content extraction. |
| **DDG MCP** | Free | Single source, no verification, no dedup, results vary wildly. |

**Agent Search MCP solves this differently:**

1. **Free + high quality** — DuckDuckGo + Sogou + Bing + Baidu as core engines, no API key needed
2. **Waterfall progressive search** — Runs engines in confidence-gated phases. Stops early when results are sufficient, saving 50-75% engine calls.
3. **Multi-source verification** — Results cross-checked across engines. Each result gets a confidence score (1-3).
4. **Content enrichment** — Low-confidence results auto-extract full page content via Jina Reader for richer context.
5. **Domain authority** — `.edu`/`.gov`/`.ac.xx` domains weighted higher; known high-quality sites scored up; low-quality domains penalized.
6. **Adaptive query expansion** — When confidence is low, auto-generates alternative queries and re-searches without LLM dependency.
7. **Token optimization** — Title ≤100 chars, snippet ≤200 chars, dedup removes redundancy. Saves ~40-50% tokens.
8. **MCP native** — Built for Model Context Protocol from day one. Zero config, works out of the box.
9. **Self-hostable** — No data sent to third parties. Run it on your own VPS.
10. **Security built-in** — Prompt injection detection, output boundary markers, phishing URL filtering.

**Who is this for?**

- AI agent developers (Hermes, OpenClaw, custom agents)
- IDE users who want AI-powered search (Claude Code, Cursor, Windsurf)
- Anyone building MCP-compatible tools
- Users who need Chinese web search (Sogou integration)

**The math:** If you search 100 times/day, Tavily costs ~$1/day. Agent Search MCP costs $0. Over a year, that's $365 saved.

---

## 为什么选择 Agent Search MCP

**AI Agent 需要搜索互联网。但现有方案都有问题：**

| 方案 | 价格 | 问题 |
|------|------|------|
| **Tavily** | $0.01/次 | 搜索多了成本高，月费 $20-50+ |
| **Exa** | $50/月起 | 语义搜索强但太贵 |
| **Brave Search** | 2000 次/月免费，之后 $3/1000 | 免费额度不够 |
| **Firecrawl** | $83/10万页 | 搜索+抓取一体，但量大了贵 |
| **Perplexity Sonar** | $5/千次 + token | 答案引擎，无法评估原始来源 |
| **Serper** | $0.30/千次 | 谷歌 SERP，无内容提取 |
| **DDG MCP** | 免费 | 单源、无验证、无去重、结果不稳定 |

**Agent Search MCP 的差异化：**

- **默认免费** — DuckDuckGo + Sogou + Bing + Baidu 为核心引擎，无需 API Key，开箱即用。Brave + Tavily 作为可选付费 fallback。
- **瀑布式渐进搜索** — 分阶段调用引擎，置信度达标即停，节省 50-75% 引擎调用。
- **多源验证** — 跨引擎交叉验证，每个结果有置信度评分（1-3），置信度 ≥2 的结果经过至少 2 个引擎验证。
- **内容丰富化** — 低置信度结果自动通过 Jina Reader 提取全文回填。
- **域名权威评分** — `.edu`/`.gov` 域名加分，高质量站点加权，低质域名扣分。
- **自适应查询扩展** — 置信度不足时自动生成备选查询重搜，无需 LLM 参与。
- **Token 优化** — 标题 ≤100 字符，摘要 ≤200 字符，URL + 标题去重。节省 ~40-50% token 消耗。
- **渐进式披露** — 3 个工具按复杂度递增：`free_search` 快速问答、`free_search_advanced` 过滤搜索+瀑布流程、`free_extract` 页面提取。Agent 按需发现。
- **Fallback 机制** — 免费引擎优先，付费引擎备用。自动合并、去重、评分。
- **健康监控** — 实时追踪 Provider 健康状态，失败 Provider 自动过滤。
- **内置安全** — Prompt 注入检测、输出边界标记、钓鱼 URL 过滤、安全元数据。

---

## Competitor Comparison

| Feature | Agent Search MCP | Tavily | Exa | Brave Search | Firecrawl | Perplexity Sonar | Serper | DDG MCP |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Price** | Free | $0.01/search | $50/mo | $3/1000 | $83/100K pages | $5/1K + tokens | $0.30/1K | Free |
| **API Key** | Not required | Required | Required | Required | Required | Required | Required | Required |
| **Free tier** | Unlimited | 1K/mo | $10 credit | 2K/mo | Limited | None | 2.5K/mo | Unlimited |
| **Multi-source** | ✅ 4+ engines | ❌ Single | ❌ Single | ❌ Single | ❌ Single | ❌ Single | ❌ Single | ❌ Single |
| **Waterfall search** | ✅ Confidence-gated | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Content enrichment** | ✅ Auto-extract | ✅ (built-in) | ✅ (built-in) | ❌ | ✅ (built-in) | ✅ (synthesis) | ❌ | ❌ |
| **Query expansion** | ✅ Rule-based | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Confidence score** | ✅ 1-3 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Domain authority** | ✅ Edu/Gov boost | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Deduplication** | ✅ URL + title | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Token optimization** | ✅ ~40-50% | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Chinese search** | ✅ Sogou + Baidu | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Semantic search** | ❌ | ❌ | ✅ Neural | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Answer engine** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Synthesis | ❌ | ❌ |
| **People/Company search** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **MCP native** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Self-hostable** | ✅ | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only | ✅ |
| **Security** | ✅ Injection protection | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dependencies** | 4 | 12+ | 15+ | 8 | 10+ | 8+ | 5 | 3 |

**Key differences:**

1. **Free by default** — No API key, no credit card, no limits. DuckDuckGo + Sogou + Bing + Baidu work out of the box.
2. **Multi-source verification** — Results from multiple engines cross-checked. Confidence score tells you how reliable a result is.
3. **Waterfall search** — Unique confidence-gated multi-phase search. Stops early when quality is sufficient, saving engine calls and tokens.
4. **Token optimization** — Smart truncation and dedup reduce token consumption by ~40-50%.
5. **Chinese support** — Sogou + Baidu provide native Chinese web search. Not a translation layer.
6. **Security** — Built-in protection against prompt injection, phishing URLs, and output boundary markers.
7. **Progressive disclosure** — 3 tools at different complexity levels. Agents discover capabilities on-demand.

**Gaps vs competitors (planned):**
- **Semantic/neural search** — Exa's neural index for conceptual queries. Could add embedding-based search.
- **Answer engine** — Perplexity-style direct answers with LLM synthesis on top of multi-source results.
- **People/company search** — Exa's entity-specific indexes for sales/intelligence use cases.

---

## Quick Start

### Prerequisites

- Node.js >= 18

That's it. All search engines work out of the box.

> **Optional:** For enhanced DuckDuckGo results, install Python + ddgs:
> ```bash
> pip install ddgs
> ```
> Without this, DuckDuckGo uses a Node.js HTML engine automatically.

### Install

```bash
# Option 1: npx (recommended)
npx agent-search-mcp

# Option 2: global install
npm install -g agent-search-mcp
```

### Platform Setup

<details>
<summary><b>Hermes</b></summary>

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  agent-search:
    command: npx
    args: ["agent-search-mcp"]
```
</details>

<details>
<summary><b>Claude Code</b></summary>

```json
// ~/.claude/mcp.json
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
// .cursor/mcp.json
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
// ~/.codeium/windsurf/mcp_config.json
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
<summary><b>OpenClaw</b></summary>

```typescript
// openclaw.config.ts
{
  mcpServers: {
    "agent-search": {
      command: "npx",
      args: ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Codex</b></summary>

```json
// ~/.codex/mcp.json
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

## Features

### Core Search
- **Free by default** — DuckDuckGo + Sogou + Bing + Baidu as core engines, no API key required. Brave + Tavily + Exa as optional paid fallback.
- **Waterfall progressive search** — 3-phase confidence-gated search: (1) DDG+Sogou → check confidence → (2) Bing+Baidu → check → (3) Brave+Tavily+Exa. Stops as soon as results are sufficient.
- **Multi-source verification** — Results cross-checked across engines, each result gets a confidence score (1-3) based on how many sources return it.
- **Content enrichment** — Low-confidence or short-snippet results auto-extract full page content via Jina Reader. Confidence boosted +0.33 (capped 1.0).
- **Domain authority scoring** — `.edu`/`.gov`/`.ac.xx` domains +0.12; known high-quality sites (wikipedia, stackoverflow, arxiv) weighted up; low-quality domains penalized.
- **Adaptive query expansion** — When waterfall confidence is insufficient, auto-generates 2 alternative queries via rule engine (4 strategies: vs-split, prefix-strip, core keyword, tech synonyms) and re-searches.

### Token & Cost Optimization
- **Token optimization** — Title truncation (≤100 chars), snippet truncation (≤200 chars), URL + title dedup. Saves ~40-50% tokens.
- **Progressive disclosure** — 3 tools at different complexity levels. `free_search` for quick queries, `free_search_advanced` for filtered + waterfall search, `free_extract` for page content. Agents discover capabilities on-demand.

### Reliability
- **Fallback chain** — Free engines first, paid engines as backup. Automatic merge, dedup, and scoring.
- **Health monitoring** — Real-time provider health tracking. Unhealthy providers filtered automatically.
- **Rate limiting** — 1s minimum interval between requests per provider.
- **Smart caching** — LRU cache with 60s TTL (max 1000 entries).

### Security
- **Prompt injection detection** — Blocks injection patterns in search queries.
- **Output boundary markers** — Clear delimiters between system output and search results.
- **Phishing URL filtering** — Detects and flags suspicious URLs.
- **SSRF protection** — Blocks private IPs, localhost, and metadata endpoints.
- **Security metadata** — Every response includes security context.

### Extras
- **CLI tool** — Use as a command-line tool for terminal search, web extraction, and HTTP server.
- **HTTP/SSE mode** — Run as HTTP server with SSE streaming (set `MODE=http`).
- **ContextManager** — Long-running autonomous session management for continuous research.

---

## CLI Usage

agent-search-mcp also works as a CLI tool.

### Install

```bash
npm install -g agent-search-mcp
```

### Search

```bash
# Basic search
fasm search "TypeScript MCP server"

# With options
fasm search "query" --count 5 --engines bing,baidu

# JSON output
fasm search "query" --json
```

### Extract Web Page

```bash
fasm extract "https://example.com"
fasm extract "https://example.com" --json
```

### Start HTTP Server

```bash
fasm serve --port 8080
```

### Help

```bash
fasm --help
```

---

## Tools

### `free_search`

Basic web search with multi-source verification.

```json
{
  "query": "TypeScript MCP server",
  "count": 5
}
```

**Returns:** Array of search results with confidence scores (1-3).

### `free_search_advanced`

Advanced search with waterfall progressive search, filtering, and enrichment.

```json
{
  "query": "MCP server",
  "count": 10,
  "min_confidence": 2,
  "time_range": "week",
  "language": "zh",
  "include_domains": ["github.com"],
  "exclude_domains": ["reddit.com"]
}
```

**Parameters:**
- `min_confidence` (1-3): Only return results verified by N+ sources
- `time_range`: day, week, month, year
- `language`: auto, en, zh
- `include_domains`: Only search these domains
- `exclude_domains`: Exclude these domains

**Waterfall behaviour (default: enabled):**
1. Phase 1: DDG + Sogou → check confidence basket
2. Phase 2 (if needed): Bing + Baidu → check basket
3. Phase 3 (if needed): Brave + Tavily + Exa (paid only)
4. Content enrichment: Low-confidence results auto-extracted via Jina Reader
5. Query expansion (if basket still insufficient): Auto-generate alternative queries

### `free_extract`

Extract full content from a URL as Markdown.

```json
{
  "url": "https://example.com/article",
  "max_length": 5000
}
```

**Returns:** Markdown content with metadata. Full text stored to disk for pages over `max_length`.

### `search_with_synthesis`

Deep search with waterfall multi-engine verification. Returns structured results plus a `prompt_hint` for LLM-powered synthesis — no external LLM API calls needed.

```json
{
  "query": "TypeScript MCP server",
  "count": 10,
  "language": "auto",
  "min_confidence": 1
}
```

**Returns:** `{ results, prompt_hint, meta }` — the `prompt_hint` field contains a formatted prompt ready for an LLM to synthesize an answer with citations.

**Behaviour:**
- Runs waterfall search (DDG+Sogou → Bing+Baidu → Brave+Tavily+Exa)
- Auto-enriches low-confidence results via Jina Reader
- Generates a `prompt_hint` with confidence scores and citation guidance

### `free_search_news`

Search recent news articles across multiple free engines.

```json
{
  "query": "AI regulation",
  "count": 10,
  "time_range": "week"
}
```

**Sources:** DuckDuckGo News + Bing News (free, no API key required).

---

## Resources

### `search://capabilities`

Returns a Markdown document describing all available tools and features. Agents can discover capabilities on-demand.

### `search://health`

Returns JSON with health status of each search provider. Useful for monitoring and debugging.

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BRAVE_API_KEY` | Brave Search API key (2000 free/month) | No |
| `TAVILY_API_KEY` | Tavily API key (1000 free/month) | No |
| `EXA_API_KEY` | Exa API key (1000 free/month) | No |
| `LOG_LEVEL` | Log level (info, debug) | No |

**Zero config works** — no API keys needed for basic search with DDG + Sogou + Bing + Baidu.

### With Paid Engines

Set environment variables to enable fallback to paid engines when free results are insufficient:

```bash
export BRAVE_API_KEY=your_key_here
export TAVILY_API_KEY=your_key_here
export EXA_API_KEY=your_key_here
```

### Tool Visibility

Control which MCP tools are registered and visible to the agent:

```bash
# Only enable search tools (disable extraction)
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news

# Disable specific tools
DISABLED_TOOLS=free_extract,fetch_github_readme

# Combine: allow search tools, but disable news
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news
DISABLED_TOOLS=free_search_news
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLED_TOOLS` | (all) | Comma-separated list of tools to enable. If set, only these tools are registered. |
| `DISABLED_TOOLS` | (none) | Comma-separated list of tools to disable. Takes priority over `ENABLED_TOOLS`. |

Available tool names: `free_search`, `free_search_advanced`, `free_extract`, `fetch_github_readme`, `search_with_synthesis`, `free_search_news`

---

## Dependencies

| Dependency | License | Purpose |
|------------|---------|---------|
| @modelcontextprotocol/sdk | MIT | MCP protocol |
| zod | MIT | Schema validation |
| pino | MIT | Logging |
| yaml | ISC | Config parsing |
| cheerio | MIT | DuckDuckGo HTML parser (Node.js native) |
| ddgs (Python, optional) | MIT | Enhanced DuckDuckGo backend (bypasses anti-bot) |

---

## Architecture

```
Agent
  ↓ MCP Protocol (stdio / HTTP)
MCP Server
  ├── Tools Layer
  │   ├── free_search (quick queries)
  │   ├── free_search_advanced (waterfall + filters)
  │   └── free_extract (page content)
  ├── Aggregation Layer
  │   ├── Waterfall Search Engine      ← NEW
  │   │   ├── Phase 1: DDG + Sogou
  │   │   ├── Phase 2: Bing + Baidu
  │   │   └── Phase 3: Brave + Tavily + Exa (paid)
  │   ├── Content Enricher (Jina)      ← NEW
  │   ├── Domain Authority Scorer       ← NEW
  │   ├── Query Expander (Rule Engine)  ← NEW
  │   ├── Confidence Basket Checker     ← NEW
  │   ├── Top-1 Snippet merge
  │   ├── URL + Title dedup
  │   ├── Scoring + Confidence
  │   └── Output truncation
  ├── Security Layer
  │   ├── Prompt injection detection
  │   ├── Output boundary markers
  │   ├── Phishing URL filtering
  │   └── Security metadata
  ├── Fallback Chain
  │   ├── Phase 1: Free engines (DDG + Sogou + Bing + Baidu)
  │   └── Phase 2: Paid engines (Brave + Tavily + Exa)
  └── Infrastructure
      ├── Cache (LRU, 60s TTL)
      ├── Rate Limiter (1s per provider)
      ├── Health Tracker
      └── SSRF Protection
```

---

## Stats

| Metric | Value |
|--------|-------|
| Test count | **149** (across 13 files) |
| Source files | ~2,500 lines TypeScript |
| Free engines | 4 (DDG + Sogou + Bing + Baidu) |
| Paid engines | 3 (Brave + Tavily + Exa) |
| npm dependencies | 4 production |
| Total engines | 7 |

---

## Documentation / 文档

| Document | Description |
|----------|-------------|
| [PRD](docs/prd.md) | Product Requirements Document |
| [Architecture](docs/architecture.md) | Technical Architecture |
| [Plan](docs/plan.md) | Implementation Plan |
| [Review Results](docs/review-results.md) | 5-Team Review Results |
| [Fork Plan](docs/fork-plan.md) | Fork & Modification Plan |
| [CHANGELOG](CHANGELOG.md) | Version History |

---

## Development

```bash
# Clone
git clone https://github.com/lennney/agent-search-mcp.git
cd agent-search-mcp

# Install
npm install

# Build
npm run build

# Test
npm test

# Run
npm start
```

---

## Roadmap

- [x] DDG + Sogou free engines, multi-source verification, dedup, scoring
- [x] Bing + Baidu engines, HTTP/SSE mode, security layer, config module
- [x] CLI binary (`fasm`), ContextManager, dual-mode server
- [x] **Waterfall search, content enrichment, domain authority, query expansion** ← You are here
- [ ] Semantic/neural search (embedding-based conceptual matching)
- [ ] Answer engine mode (LLM synthesis on multi-source results)
- [ ] Entity-specific search (people, companies, code)
- [ ] Plugin system for custom engines
- [ ] Browser-based extraction (Playwright)

---

## License

[Apache License 2.0](LICENSE)

Based on [open-websearch](https://github.com/Aas-ee/open-websearch) by Aas-ee.

```
Copyright 2025 Open-WebSearch MCP Server Contributors
Based on open-websearch by Aas-ee (Apache 2.0).
Modified by Agent Search MCP Contributors.
Copyright 2026 Agent Search MCP Contributors
```

---

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.
