# Changelog

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
