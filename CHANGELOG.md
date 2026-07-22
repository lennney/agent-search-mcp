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
