# Agent Search MCP

> 🔍 Free multi-source search for AI agents — multi-source verification, token savings, MCP native.

[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/tests-42%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)

**Works with Hermes, Claude Code, Cursor, Windsurf, OpenClaw, Codex, and any MCP-compatible client.**

---

[English](#why-agent-search-mcp) · [中文](README_zh.md) · [安装](#quick-start) · [工具文档](#tools) · [竞品对比](#competitor-comparison)

---

## Why Agent Search MCP

**AI agents need to search the internet. But existing solutions have problems:**

- **Tavily** — Great quality, but $0.01/search adds up fast. Monthly cost: $20-50+.
- **Exa** — Semantic search is powerful, but $50/month minimum.
- **Brave Search** — 2000 free queries/month, then $3/1000. Not enough for heavy use.
- **DDG MCP** — Single source, no verification, no dedup, results vary wildly.
- **open-websearch** — 13 engines, but 300MB+ dependency tree, no token optimization.

**Agent Search MCP solves this differently:**

1. **Free + high quality** — DuckDuckGo + Sogou as core engines, no API key needed
2. **Multi-source verification** — Results cross-checked across engines, each result gets a confidence score (1-3)
3. **Token optimization** — Title ≤100 chars, snippet ≤200 chars, dedup removes redundancy. Saves ~40-50% tokens.
4. **MCP native** — Built for Model Context Protocol from day one. Zero config, works out of the box.
5. **Self-hostable** — No data sent to third parties. Run it on your own VPS.

**Who is this for?**

- AI agent developers (Hermes, OpenClaw, custom agents)
- IDE users who want AI-powered search (Claude Code, Cursor, Windsurf)
- Anyone building MCP-compatible tools
- Users who need Chinese web search (Sogou integration)

**The math:** If you search 100 times/day, Tavily costs ~$1/day. Agent Search MCP costs $0. Over a year, that's $365 saved.

---

## 为什么选择 Agent Search MCP

**AI Agent 需要搜索互联网。但现有方案都有问题：**

- **Tavily** — 质量好，但每次搜索 $0.01，月费 $20-50+
- **Exa** — 语义搜索强，但最低 $50/月
- **Brave Search** — 2000 次/月免费，之后 $3/1000，重度使用不够
- **DDG MCP** — 单源，无验证，无去重，结果质量不稳定
- **open-websearch** — 13 引擎，但 300MB+ 依赖，无 token 优化

**Agent Search MCP 的解决方案：**

1. **免费 + 高质量** — DuckDuckGo + Sogou 为核心，无需 API Key
2. **多源验证** — 跨引擎交叉验证，每个结果有置信度评分（1-3）
3. **Token 优化** — 标题 ≤100 字符，摘要 ≤200 字符，去重去除冗余。节省 ~40-50% token
4. **MCP 原生** — 基于 Model Context Protocol 构建，零配置开箱即用
5. **可自托管** — 数据不经过第三方，可在自有 VPS 运行

**适用人群：**

- AI Agent 开发者（Hermes、OpenClaw、自定义 Agent）
- IDE 用户（Claude Code、Cursor、Windsurf）
- 构建 MCP 兼容工具的开发者
- 需要中文搜索的用户（搜狗集成）

**成本对比：** 如果每天搜索 100 次，Tavily 月费约 $30。Agent Search MCP 完全免费。一年省 $365。

---

## Competitor Comparison

| Feature | Agent Search MCP | Tavily | Exa | Brave Search | DDG MCP |
|---------|:---:|:---:|:---:|:---:|:---:|
| **Price** | Free | $0.01/search | $50/mo | $3/1000 | Free |
| **API Key** | Not required | Required | Required | Required | Required |
| **Multi-source** | ✅ 2-4 engines | ❌ Single | ❌ Single | ❌ Single | ❌ Single |
| **Confidence score** | ✅ 1-3 | ❌ | ❌ | ❌ | ❌ |
| **Deduplication** | ✅ URL + title | ❌ | ❌ | ❌ | ❌ |
| **Token optimization** | ✅ ~40-50% | ❌ | ❌ | ❌ | ❌ |
| **Chinese search** | ✅ Sogou | ❌ | ❌ | ❌ | ❌ |
| **MCP native** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Self-hostable** | ✅ | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only | ✅ |
| **Progressive disclosure** | ✅ 3 tools | ❌ | ❌ | ❌ | ❌ |
| **Health monitoring** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Fallback chain** | ✅ Free→Paid | ❌ | ❌ | ❌ | ❌ |
| **Dependencies** | 4 | 12+ | 15+ | 8 | 3 |

**Key differences:**

1. **Free by default** — No API key, no credit card, no limits. DuckDuckGo + Sogou work out of the box.
2. **Multi-source verification** — Results from multiple engines are cross-checked. Confidence score tells you how reliable a result is.
3. **Token optimization** — Smart truncation and dedup reduce token consumption by ~40-50%. This is crucial for cost-sensitive applications.
4. **Chinese support** — Sogou engine provides native Chinese web search. Not a translation layer.
5. **Progressive disclosure** — 3 tools at different complexity levels. Agents discover capabilities on-demand (Exa model).

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Python 3 with `ddgs` library:
```bash
pip install ddgs
```

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

### 🆓 Free by Default

No API key required. Uses DuckDuckGo + Sogou search engines.

| Engine | Type | API Key | Coverage |
|--------|------|---------|----------|
| DuckDuckGo | Free | ❌ | Global |
| Sogou | Free | ❌ | Chinese |
| Brave Search | Paid (Free Tier) | Optional | Global |
| Tavily | Paid (Free Tier) | Optional | Global |

### 🎯 Multi-Source Verification

Results are verified across multiple search engines. Each result includes a **confidence score** (1-3) based on how many engines returned it.

```json
{
  "title": "Build an MCP Server",
  "url": "https://example.com/mcp",
  "snippet": "How to build MCP servers...",
  "confidence": 2  // Verified by 2 engines
}
```

**Why this matters:** Single-source search can return unreliable results. Cross-verification across engines gives you higher confidence in what you find.

### 💰 Save Tokens

Optimized output reduces token consumption by ~40-50%:

| Optimization | Savings |
|-------------|---------|
| Top-1 snippet per URL | ~25% |
| Title truncation (≤100 chars) | ~15% |
| Snippet truncation (≤200 chars) | ~15% |
| Deduplication | ~10% |
| Confidence filtering | ~10% |

**Example:** Searching "TypeScript MCP server tutorial" returns 50 raw results. After dedup: 35. After truncation and confidence filtering: 20 high-quality results with ~40% fewer tokens.

### 🔧 Progressive Disclosure

Three tools, discoverable by agents:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `free_search` | Basic search | Quick questions |
| `free_search_advanced` | Filtered search | Date ranges, domains, high confidence |
| `free_extract` | URL extraction | Read full page content |

**Design principle:** Inspired by Exa's approach. Simple tools by default, complex capabilities available on-demand. Agents discover what they need.

### 🔗 Fallback Chain

Free engines first, paid engines as backup:

```
Phase 1: DuckDuckGo + Sogou (free, concurrent)
    ↓ If insufficient results
Phase 2: Brave + Tavily (paid, free tier)
    ↓ Merge + dedup + score
Final: Ranked results with confidence scores
```

### 🏥 Health Monitoring

Track provider health in real-time:

```json
[
  {
    "provider": "duckduckgo",
    "lastSuccess": 1719000000000,
    "errorCount": 0,
    "avgLatency": 450,
    "isHealthy": true
  }
]
```

Unhealthy providers are automatically filtered out. No manual intervention needed.

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

**Returns:** Array of search results with confidence scores.

### `free_search_advanced`

Advanced search with filters.

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

### `free_extract`

Extract full content from a URL as Markdown.

```json
{
  "url": "https://example.com/article",
  "max_length": 5000
}
```

**Returns:** Markdown content with metadata.

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
| `LOG_LEVEL` | Log level (info, debug) | No |

**Zero config works** — no API keys needed for basic search.

### With Paid Engines

Set environment variables to enable fallback to paid engines when free results are insufficient:

```bash
export BRAVE_API_KEY=your_key_here
export TAVILY_API_KEY=your_key_here
```

---

## Dependencies

| Dependency | License | Purpose |
|------------|---------|---------|
| @modelcontextprotocol/sdk | MIT | MCP protocol |
| zod | MIT | Schema validation |
| pino | MIT | Logging |
| yaml | ISC | Config parsing |
| ddgs (Python) | MIT | DuckDuckGo search backend (bypasses anti-bot) |

**Note:** `ddgs` is a Python library called via subprocess. It must be installed separately:
```bash
pip install ddgs
```

---

## Architecture

```
Agent
  ↓ MCP Protocol (stdio)
MCP Server
  ├── Tools Layer (progressive disclosure)
  │   ├── free_search (default)
  │   ├── free_search_advanced (optional)
  │   └── free_extract (optional)
  ├── Aggregation Layer
  │   ├── Top-1 Snippet merge
  │   ├── URL + Title dedup
  │   ├── Scoring + Confidence
  │   └── Output truncation
  ├── Fallback Chain
  │   ├── Phase 1: Free engines (DDG + Sogou)
  │   └── Phase 2: Paid engines (Brave + Tavily)
  └── Infrastructure
      ├── Cache (LRU, 60s TTL)
      ├── Rate Limiter (1s per provider)
      ├── Health Tracker
      └── SSRF Protection
```

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

- [ ] v0.1.0 — Initial release with DDG + Sogou
- [ ] v0.2.0 — Brave + Tavily fallback
- [ ] v0.3.0 — Health monitoring + rate limiting
- [ ] v1.0.0 — Stable release with documentation
- [ ] v1.1.0 — Plugin system for custom engines
- [ ] v2.0.0 — Browser-based extraction (Playwright)

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

---

## Keywords

MCP server, Model Context Protocol, AI agent search, free web search, multi-source search, DuckDuckGo MCP, Sogou search, token optimization, Hermes MCP, Claude Code MCP, Cursor MCP, AI tool, web search for agents, search aggregation, confidence scoring, 中文搜索, MCP 服务器, AI Agent 搜索, 免费搜索, 搜狗搜索, MCP 兼容, 自托管搜索
