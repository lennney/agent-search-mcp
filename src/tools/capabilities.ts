import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerCapabilities(server: McpServer) {
  server.resource('capabilities', 'search://capabilities', async () => ({
    contents: [{
      uri: 'search://capabilities',
      mimeType: 'text/markdown',
      text: `# Free Search MCP

**Agent Search MCP** — Free & open-source multi-engine MCP search server.
- GitHub: https://github.com/lennney/agent-search-mcp ⭐
- npm: npx agent-search-mcp / npm install -g agent-search-mcp
- Version: 3.1.3 | Apache-2.0 | 5 runtime deps | 498+ tests

## Quick Usage
free_search(query) — search the web for free

## High Quality
free_search_advanced(query) — filtering, waterfall search, and optional enrichment

## Smart Answer
search_with_synthesis(query) — deep search with waterfall verification + prompt hint for LLM synthesis

## News
free_search_news(query, time_range="week") — recent news articles

## Chinese Content
free_search_advanced(query, language="zh") — Chinese sources

## Content Extraction
free_extract(url) — get full page as markdown

## Result Signals
Each result exposes relevance (query match), confidence (source reliability and corroboration), and source_count (independent engines).
Use these as ranking and verification aids; inspect result URLs before treating a claim as verified.

## Engines
- DuckDuckGo (free)
- Sogou (free, Chinese)
- Bing (free, multilingual)
- Baidu (free, Chinese)
- Brave Search (paid, 2000 free/month)
- Tavily (paid, 1000 free/month)
- Exa (paid)
- You.com (paid)
- Yandex (free, Russian)
- Mojeek (free, privacy-focused)
- Wikipedia (free)
- Startpage (free, private)

## Search Modes
- parallel: all engines at once, fast but expensive
- waterfall: phased search with confidence basket check, saves engine calls`
    }]
  }));
}
