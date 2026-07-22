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

## [Unreleased]

### Added
- DuckDuckGo HTML engine — Node.js native DDG search via cheerio, no Python required
- `isDdgsAvailable()` exported from DDG engine for health reporting
- DDG health report includes `ddgs_available` field
- `partialFailures` now correctly includes DDG unavailability with engine name
- DDG HTML engine uses POST (ddgs pattern) with rotating User-Agents (4 agents)
- HTTP 202 rate-limit detection + captcha challenge page detection in DDG HTML engine

### Changed
- DDG engine: Python path preferred → HTML fallback when ddgs unavailable
- `findPython()` → lazy detection (cached, runs once per process)
- `console.error` → `logger.warn` in DDG engine
- Dockerfile: removed Python/ddgs from runtime image
- README: `pip install ddgs` is now optional, not required
- DDG HTML engine: GET → POST with form-encoded body (`q`, `b`, `l` params)

### Fixed
- `partialFailures` entries now show correct engine name instead of "unknown"
- DDG HTML engine: protocol-relative URL parsing (`//duckduckgo.com/l/?uddg=...`) — `new URL()` was throwing, users got DDG redirect links instead of real URLs
- DDG HTML engine: ad filtering via `result--ad` class + `duckduckgo.com/y.js` URL rejection (ads were appearing in results)

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
