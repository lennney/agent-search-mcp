import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerCapabilities(server: McpServer) {
  server.resource('capabilities', 'search://capabilities', async () => ({
    contents: [{
      uri: 'search://capabilities',
      mimeType: 'text/markdown',
      text: `# Free Search MCP

## Quick Usage
free_search(query) — search the web for free

## High Quality
free_search_advanced(query, min_confidence=2) — verified results only

## Chinese Content
free_search_advanced(query, language="zh") — Chinese sources

## Content Extraction
free_extract(url) — get full page as markdown

## Confidence Scores
Each result has confidence 1-3 based on multi-source verification.
- 1: Single source
- 2: Verified by 2 sources (recommended)
- 3: Highly verified by 3+ sources

## Engines
- DuckDuckGo (free)
- Sogou (free, Chinese)
- Bing (free, multilingual)
- Baidu (free, Chinese)
- Brave Search (paid, 2000 free/month)
- Tavily (paid, 1000 free/month)`
    }]
  }));
}
