---
type: Changelog
title: Agent Search MCP CHANGELOG
timestamp: '2026-07-20T23:35:20+08:00'
description: 版本变更记录
tags:
- agent-search-mcp
- changelog
---
# Changelog

## v3.3.0 (2026-07-24)

> **Headline: Semantic dedup + rerank via Model2Vec. <10ms latency. Optional, opt-in.**

### 🆕 Features

- **Semantic dedup** (`SEMANTIC_DEDUP=true`): Removes semantically duplicate results across engines using cosine similarity on Model2Vec embeddings. Keeps higher-confidence items. Adds `removedCount` feedback.
- **Semantic rerank** (`SEMANTIC_RERANK=true`): Reorders results by semantic similarity to the query. Returns top-K most relevant results.
- **Model2Vec bridge**: Persistent Python child process (`src/aggregation/semantic_bridge.py`) running `minishlab/M2V_base_output` (256-dim, 7.2MB model). Embedding speed ~35µs/text, dedup + rerank <5ms total latency.
- **Zero dependency by default**: Semantic features are OFF by default. No Python/model2vec required unless explicitly enabled.
- **Graceful degradation**: If the Python bridge is unavailable (no model2vec installed, process crash, etc.), results pass through unchanged — no broken searches.

### 🔧 Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMANTIC_DEDUP` | `false` | Enable semantic dedup |
| `DEDUP_THRESHOLD` | `0.85` | Cosine similarity threshold |
| `DEDUP_MODEL` | `minishlab/M2V_base_output` | Model2Vec model for dedup |
| `SEMANTIC_RERANK` | `false` | Enable semantic rerank |
| `RERANK_TOP_K` | `5` | Results to keep after rerank |
| `RERANK_MODEL` | `minishlab/M2V_base_output` | Model2Vec model for rerank |

### 📊 Stats

- **Tests**: 480 passing (+17: 6 semantic + 11 config)
- **Files**: 42 test files (+1: semantic.test.ts)

## v3.2.0 (2026-07-24)

> **Headline: Progressive disclosure + confidence filtering. 36-58% fewer tokens in compact mode.**

### 🆕 Features

- **Progressive disclosure**: `MAX_FULL_RESULTS` (default 3) — first N results full (title+snippet+confidence), remaining compacted (title+url+`compacted:true`). Agent can expand via `free_extract`. Saves ~36% tokens.
- **Confidence filtering**: `MIN_CONFIDENCE` (default 0=off) — filter out low-confidence results before formatting. Adds `filtered_count` to meta.
- **Traceable**: `compacted:true` marker, `compacted_count`, `filtered_count` in meta — Agent knows what's truncated and can recover.
- **New env vars**: `MAX_FULL_RESULTS` (1-20), `MIN_CONFIDENCE` (0.0-3.0)

### 🔧 Fixes

- `compact` mode now includes `compacted_count` and `filtered_count` in meta when respective options are active

## v3.1.2 (2026-07-22)

> **Headline: Glama quality score B→A. CI, glama.json, TDQS tool descriptions optimized.**

### 📢 Why Update

- **Glama quality score**: Added `glama.json` metadata, improved tool descriptions per TDQS framework, added GitHub Actions CI — pushing score from B to A tier
- **TDQS tool descriptions**: All 3 primary tools optimized for Glama's Tool Definition Quality Score (6 dimensions per tool)
- **CI pipeline**: Added GitHub Actions CI workflow (build + lint + test across Node 18/20/22)

### 🆕 Features

- **glama.json**: Added server metadata file for Glama directory — enables maintainer verification, related servers, and richer listing
- **CI workflow**: GitHub Actions CI with Node 18/20/22 matrix, lint, build, test, and type-check steps

### 🔧 Fixes

- `free_search` tool description: Added `.describe()` for `query` parameter (was missing, causing 67% schema coverage), improved Usage Guidelines with explicit sibling tool references
- `free_extract` tool description: Added behavioral details (timeout, error modes, SSRF), improved parameter descriptions beyond schema

### 📊 Stats

- **Tests**: 448 passing (unchanged)
- **Engines**: 11 (8 free, 3 paid)
- **Glama Score**: B → A (target)

---

## v3.1.1 (2026-07-22)

> **Headline: MCP 2025 compliance + DDG News HTML fallback + structured errors.**

### 📢 Why Update

- **Agent UX**: All 8 tools now use MCP 2025 standard `registerTool` with `readOnlyHint`/`idempotentHint` annotations — agents make better tool selection decisions
- **DDG News reliability**: News search now falls back to Node.js HTML engine when Python/ddgs is unavailable — no more silent empty results
- **Streamable HTTP**: HTTP mode upgraded from deprecated HTTP+SSE to MCP 2025-11-25 Streamable HTTP transport
- **Structured errors**: Engine failures now return typed `EngineError` (timeout/rate_limited/permission_denied/etc.) with actionable suggestions — agents can self-recover

### 🆕 Features

- **C1: DDG News HTML 回退** — `searchDuckduckgoNews()` now falls back to cheerio HTML engine when Python unavailable, matching the web search behavior
- **A2: MCP Tool annotations** — All 8 tools use `registerTool()` with `{ readOnlyHint: true, idempotentHint: true }` (MCP 2025 standard)
- **A3: Structured EngineError** — New `EngineError` type with `type` (timeout/upstream_4xx/upstream_5xx/rate_limited/permission_denied/unknown) and `suggestion` fields
- **B1: Streamable HTTP transport** — HTTP mode now uses `StreamableHTTPServerTransport` per MCP 2025-11-25 spec; POST/GET/DELETE `/mcp` endpoint
- **B2: Capabilities negotiation** — Server explicitly declares `tools` and `resources` capabilities during initialization
- **D3: E2E integration tests** — 4 end-to-end tests spawning server as subprocess, verifying initialize/list-tools/tool-calls

### 🔧 Fixes

- News search no longer returns empty results when Python/ddgs is unavailable
- Error responses now include structured type information for agent self-recovery
- HTTP mode deprecated SSE endpoint replaced with standard Streamable HTTP

### 📊 Stats

- **Tests**: 448 passing (was 438), 40 test files (was 38)
- **Engines**: 11 (8 free, 3 paid)
- **Dependencies**: 5 production (unchanged)

---

## v3.1.0 (2026-07-22)

> **Headline: No more Python dependency. `npm install` is enough.**

### 📢 Why Update

- **If you're on Docker**: Remove Python from your image. Our image is now ~30% smaller and works on arm/v7.
- **If you had `ddgs not found` errors**: Gone. DDG now works without Python — automatic Node.js fallback.
- **If you want to limit tool visibility**: Use `ENABLED_TOOLS`/`DISABLED_TOOLS` to control what your agent can see.
- **If you want auto-update notices**: CLI now checks npm for new versions and tells you to `npm update -g`.

### 🎉 DDGS Independence

DuckDuckGo search now works without Python. A Node.js HTML engine (cheerio) serves as automatic fallback when Python/ddgs is unavailable. Docker image no longer includes Python — smaller, faster, architecture-independent.

- **Python preferred + HTML fallback**: ddgs is detected lazily (cached). When available, Python path is used (more stable, DDG internal API). When unavailable, Node.js cheerio HTML engine takes over automatically.
- **DDG HTML engine**: POST requests (ddgs pattern), rotating User-Agents (4 agents), HTTP 202 rate-limit detection, captcha page detection, protocol-relative URL resolution, ad filtering.
- **Docker**: Removed Python/ddgs from runtime image. Works on arm/v7 without pip compatibility issues.
- **Health reporting**: `search://health` includes `ddgs_available` boolean per DDG provider.

### 🛠 Tool Visibility Control

`ENABLED_TOOLS` / `DISABLED_TOOLS` env vars let users control which MCP tools are registered and visible to the agent. `ToolPolicy` class uses the same allow/deny pattern as `EnginePolicy`.

```bash
ENABLED_TOOLS=free_search,free_search_advanced
DISABLED_TOOLS=free_extract,fetch_github_readme
```

### 📦 npm Ecosystem

- `llms.txt` — LLM-optimized project overview for agent-based discovery
- Optimized `package.json` keywords (23 tags) and description for npm search ranking
- Updated badges (TypeScript badge, test count 438, Glama score)

### 🔧 Fixes

- `partialFailures` entries now show correct engine name (was "unknown")
- Removed unused `ENABLED_TOOLS`/`DISABLED_TOOLS` raw string fields from Config

### 📊 Stats

- **Tests**: 438 passing (was 235 at v3.0.0), 38 test files (was 21)
- **Engines**: 11 (8 free, 3 paid)
- **Dependencies**: 5 production (removed Python as hard dependency)

---

## v3.0.0 (2026-07-17)

### 🎉 Major Features

- **New free engines**: Wikipedia (clean JSON API), Startpage (Google proxy), Yandex, Mojeek → 8 free engines total
- **News search** (`free_search_news`): DDG News + Bing News RSS fallback, time-range filtering (day/week/month)
- **Language auto-detection**: CJK/Japanese/Korean/English heuristic → smart engine routing
- **Rate limit exposure**: Every search returns `rate_limits` per engine (remainingMs, nextAvailableAt)
- **Chinese optimization**: 12 authority domains (baike.baidu.com, zhihu.com, csdn.net...), 300-char CJK snippets, S/T conversion + stopword removal
- **Answer engine refactored**: `search_with_synthesis` now returns structured results + `prompt_hint` for agent-side synthesis — **zero LLM deps**, zero API keys, works on Raspberry Pi

### Architecture

- SDK bump: `@modelcontextprotocol/sdk` ^1.11.2 → ^1.29.0
- Rate limiter API: `getRateLimitInfo()`, `getAllRateLimits()`
- Engine allow/denylist via `ALLOWED_ENGINES` / `DENIED_ENGINES` env vars
- Adaptive concurrency: dynamic batch size based on engine health

### Testing

- 235 tests passing across 21 test files (was 140/13)

### Breaking Changes

- `search_with_synthesis` response format: now returns `{results, prompt_hint, meta}` instead of synthesized answer
- Removed `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` env vars (no longer needed)
- `RateLimitInfo` interface changed: `remainingMs`/`nextAvailableAt` instead of `remaining`/`resetInMs`

## v2.2.0 (2026-07-08)

### Features

- **Waterfall progressive search**...

## v2.0.0 (2026-06-22)

### Features

- **Bing search engine**: Full Bing Web Search API integration
- **Baidu search engine**: Full Baidu search API integration
- **HTTP/SSE server**: Built-in HTTP server with health check endpoints and SSE streaming support
- **Security layer**: Prompt injection protection, output boundary markers, phishing URL filtering
- **Config module**: Environment variable parsing with defaults and validation
- **Shared HTML utilities**: Common HTML parsing and content extraction module
- **Architecture fusion**: Merged best patterns from ddgs/open-websearch/brave-mcp — provider dedup, frequency scoring, token optimization

### Improvements

- Multi-engine aggregation: provider-level dedup to avoid redundant queries
- Frequency-based scoring: results verified by multiple engines rank higher
- Cross-engine confidence scoring with cosine similarity fallback
- Respect `Referer` header in HTTP requests
- Better error handling and retry logic across all engines

### Dependencies

- Added `yaml` for configuration file parsing

## v1.0.1 (2026-06-22)

### Bug Fixes

- **DDG search**: Use `ddgs` Python library as backend (bypasses anti-bot detection)
- **Logger**: Write to stderr instead of stdout (stdout reserved for JSON-RPC)
- **Default engines**: Changed from `['duckduckgo']` to `['duckduckgo', 'sogou']`

### Dependencies

- Added `ddgs` (MIT) as Python dependency for DuckDuckGo search

## v1.0.0 (2026-06-22)

### Initial Release

- **Free search engines**: DuckDuckGo and Sogou — no API keys required
- **Paid engine support**: Brave Search and Tavily (optional, with API keys)
- **Two-phase search**: Falls back from free engines to paid engines when more results are needed
- **Deduplication**: By URL (exact) and by title (Jaccard similarity)
- **Scoring & ranking**: Results scored by query relevance, multi-source confidence, and configurable engine weights
- **Formatting**: Truncated safe output with metadata (total, high-confidence count, unique engines)
- **Health tracking**: Per-provider success/failure tracking with automatic circuit-breaking (5 consecutive failures)
- **Rate limiting**: Minimum 1-second interval between requests per provider
- **Smart caching**: TTL-based cache with automatic eviction (max 1000 entries, 60s TTL)
- **URL validation**: SSRF protection blocking private IPs, localhost, and metadata endpoints
- **MCP tools**:
  - `free_search` — simple web search with automatic fallback
  - `free_search_advanced` — search with filtering, domain include/exclude, language, and confidence thresholds
  - `free_extract` — extract page content as markdown via Jina Reader
- **MCP resources**:
  - `search://capabilities` — server capabilities overview
  - `search://health` — per-provider health status
- **Environment variables**: `BRAVE_API_KEY`, `TAVILY_API_KEY`, `LOG_LEVEL`

### Compatibility

- Node.js >= 18
- Works with Hermes, Claude Code, Cursor, Windsurf, OpenClaw, and any MCP-compatible client
