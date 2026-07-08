# Changelog

## v2.2.0 (2026-07-08)

### Features

- **Waterfall progressive search** (`free_search_advanced`): Three-phase confidence-based search — DDG+Sogou → confidence check → Bing+Baidu → check → Brave+Tavily+Exa. Stops early when confidence basket is full, saving 50-75% engine calls.
- **Content enrichment**: Low-confidence results auto-extract full page content via Jina Reader. Snippet replaced with extracted text, confidence boosted +0.33 (capped 1.0).
- **Domain authority scoring**: `.edu`/`.gov`/`.ac.xx` domains get score boost (+0.12); known high-quality sites (wikipedia, stackoverflow, arxiv) weighted up; low-quality domains (blogspot, wordpress.com) penalized.
- **Adaptive query expansion**: When waterfall confidence is insufficient, auto-generates alternative queries via rule engine (vs-split, prefix-strip, core keyword extraction, tech synonyms) and re-searches.

### Improvements

- `free_search_advanced` defaults to waterfall=enrich=true, `free_search` stays backward-compatible
- `checkConfidenceBasket()` utility extracted as reusable aggregation primitive
- `expandQuery()` rule engine covers 4 strategies without LLM dependency

### Testing

- 140 tests passing across 13 test files (was 95/11)
- New modules: enricher, query-expander, checkConfidenceBasket

## v2.1.1 (2026-07-03)

### Features

- **CLI binary (`fasm`)**: Full CLI with argument parsing, help text, and search/health commands
- **ContextManager**: Long-running autonomous session management with automatic context compaction
- **HTTP mode support**: Run MCP server in HTTP/SSE or stdio+HTTP dual mode (`MODE=http`, `MODE=both`)
- **Package.json scripts**: `dev:http`, `dev:both`, `start:http`, `cli` for development convenience

### Documentation

- Added CLI usage documentation to README (both English and Chinese)
- Renamed CLI binary from `asm` → `fas` → `fasm` for clarity
- Added HTTP mode configuration examples

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
