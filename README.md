# Agent Search MCP

> **Free, token-efficient web search for AI agents.**
> Start with eight zero-key sources. Spend less context through waterfall stopping and compact output. Route Chinese queries natively and escalate to optional commercial APIs only when needed. `npx agent-search-mcp` is all you need.

[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![GitHub stars](https://img.shields.io/github/stars/lennney/agent-search-mcp)](https://github.com/lennney/agent-search-mcp/stargazers)
[![CI](https://github.com/lennney/agent-search-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lennney/agent-search-mcp/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Glama](https://glama.ai/mcp/servers/lennney/agent-search-mcp/badges/score.svg)](https://glama.ai/mcp/servers/lennney/agent-search-mcp)

[中文文档](README_zh.md) · [Benchmarks](./benchmarks/) · [CHANGELOG](./CHANGELOG.md)

---

## Why Agent Search MCP

The immediate value is simple: **search without paying for an API, and return fewer tokens without blindly throwing away evidence**. The mechanism behind that promise is a search policy for **where to search, when to stop, how much context to spend, and what evidence to trust**. Agent Search MCP is that control layer: a local-first search router, not another single-backend search API.

The route is deliberate: **zero-key start → Chinese-native routing → inspectable multi-source evidence → token-aware progressive search → optional commercial escalation**. The 12 adapters serve this route; adapter count is not the product story by itself.

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

### Inspectable evidence packets

Full results select a deterministic query-relevant passage and keep provenance,
relevance, independent source count, upstream publication time, and extraction
metadata as separate fields. One response-level character budget bounds passage
content, while compact placeholders retain their source list and engine
failures remain visible in `partialFailures`.

### Token control is a product feature

`OUTPUT_STYLE=compact`, `MAX_FULL_RESULTS`, `SNIPPET_LENGTH`, `EVIDENCE_BUDGET_CHARS`, `MIN_CONFIDENCE`, and `MIN_SOURCE_COUNT` let operators trade context size against detail. A historical 30-query live run measured **28.7% fewer tokens in Compact mode**, **35.5% in Compact+**, and **75% fewer engine calls than naive eight-engine fan-out**. These are scoped measurements for that query set and environment, not universal guarantees. The frozen-fixture replay now includes evidence metadata and reproducibly measures 28.4% / 30.4% formatting savings.

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

The package contains 12 engine adapters, all selectable through `free_search`, `free_search_advanced`, the CLI, and waterfall routing. Eight work without credentials; Brave, Tavily, Exa, and You.com are enabled when their API keys are present.

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

`search_with_synthesis.min_confidence` uses the same normalized `0-1`
source-reliability scale as the other search tools. Use `min_source_count` for
independent-engine corroboration. Legacy `min_confidence=2/3` inputs remain
accepted and are mapped to source count.

Search execution keeps fallback resilient without hiding operational evidence:
thrown adapter failures are returned in `partialFailures`, while successful and
skipped engines continue normally. MCP request cancellation is propagated into
rate-limit waits, retries, engine HTTP calls, and optional enrichment.

Enrichment only replaces a weak snippet with extracted page content. It does
not increase `confidence` or `source_count`, because extraction is not an
independent source. Parallel and waterfall modes use the same cache contract,
including cache reads in waterfall mode.

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
| `EVIDENCE_BUDGET_CHARS` | `1200` | Shared passage budget per response (200-20000 characters) |
| `MIN_CONFIDENCE` | `0` | Confidence threshold filter (0.0–1.0); legacy values 2–3 map to source count |
| `MIN_SOURCE_COUNT` | `1` | Minimum number of independent engine sources (1–12) |
| `HTTP_AUTH_TOKEN` | — | Bearer token required by HTTP mode |
| `HTTP_ALLOW_UNAUTHENTICATED` | `false` | Explicitly opt out of HTTP authentication (trusted local networks only) |
| `ALLOWED_ORIGINS` | — | Comma-separated browser origins allowed to call HTTP endpoints |
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

### HTTP deployment

HTTP mode is secure-by-default: `/mcp` requires `Authorization: Bearer <token>`, and browser requests with an `Origin` header must match `ALLOWED_ORIGINS`. Keep `/health` available for probes, terminate TLS at a trusted reverse proxy, and rotate the token as a secret. See the [HTTP deployment guide](./docs/http-deployment.md).

### MCP 2026-07-28 readiness

The production entrypoint currently speaks MCP `2025-11-25`. `/health` reports
that stable version separately from the experimental `2026-07-28` target, and
HTTP CORS allows the new routing and W3C trace headers. Full 2026 wire support
requires the TypeScript SDK v2 and Node.js 20+. An isolated Node.js 20+
prototype now pins SDK v2 beta.5, explicitly negotiates `2026-07-28`, and
serves both HTTP and stdio without changing the production dependency tree:

```bash
npm --prefix experiments/mcp-2026 install
npm run experimental:2026:test
HTTP_AUTH_TOKEN=replace-me npm run experimental:2026:http
```

It remains opt-in until the official conformance suite publishes and passes
the 2026 scenarios. SDK v2 `auto` fallback to the stable server is covered over
both real HTTP and stdio entrypoints, with an experimental Node 20/22 CI matrix
configured to keep that path covered. Its HTTP boundary also rejects duplicate
standard and `Mcp-Param-*` routing fields before Node combines them, while the
pinned SDK verifies parameter-header canonicalization against tool input
schemas. The P2 behavior matrix also verifies CORS/Origin and Bearer policy,
W3C trace propagation to the search boundary, real-socket cancellation,
tool-list cache hints, and automatic cache refresh after `tools/list_changed`.
Its redacted raw HTTP capture records the local Node runtime and exact SDK
pins without presenting configured CI targets as executed evidence. See the
[2026 readiness plan](./docs/plans/2026-07-25-mcp-ecosystem-and-2026-readiness.md).

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

# HTTP server (Bearer auth is required for MCP HTTP mode)
HTTP_AUTH_TOKEN=change-me MODE=http npx agent-search-mcp
```

---

## Benchmark

The benchmark has three evidence tracks. The historical 2026-07-24 live run covers 30 EN/ZH queries and measured 28.7% Compact, 35.5% Compact+, and 75% fewer calls versus naive eight-engine fan-out. The frozen formatting replay verifies the evidence-packet summary (currently 28.4% / 30.4%). A new human-gated pipeline preserves raw response hashes and engine outcomes, then reports graded retrieval, citation support, tokens per correct answer, latency, and failure transparency separately. Bootstrap labels are explicitly ineligible for public quality claims; the checked-in real pilot is still pending human review. None of these tracks is a universal production guarantee.

A second real-network qualification capture now returns 10 Wikipedia
candidates for each of two bilingual questions and generates two blinded
reviewer packets. It validates the reviewer workflow only: it is single-engine,
not yet a multi-system pool, and contains no human judgments.

The benchmark toolchain can now combine two or more traced system captures
into a deterministic URL pool, create provenance-blinded reviewer packets, and
validate completed human review/adjudication artifacts. This is infrastructure,
not a quality result: no public comparison is eligible until a real
multi-system capture has two independent human reviews and completed
adjudication.

Once that gate is satisfied, the same toolchain reconstructs each system's
protected ranking and emits per-system pooled-qrels metrics. Reported Recall is
candidate-pool-relative; answer accuracy is not inferred from result relevance.
Reviewer raw agreement and pairwise kappa remain attached to the comparison so
adjudication does not erase evidence about labeling difficulty.
Small human-reviewed pilots remain ineligible for headline comparisons:
overall reports require 30 adjudicated rows with 30 distinct queries; slices
require 10 rows with 10 distinct queries.

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
The private `experiments/mcp-2026` package requires Node.js 20+ and has its own
lockfile so SDK v2 beta dependencies cannot change the stable package.

---

## License

[Apache 2.0](LICENSE)

Based on [open-websearch](https://github.com/Aas-ee/open-websearch) by Aas-ee.
