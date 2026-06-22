import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchWithFallback } from './free-search.js';

export function registerFreeSearchAdvanced(server: McpServer) {
  server.tool(
    'free_search_advanced',
    `Advanced search with filters and quality control.

Best for: Date ranges, domain filtering, high-confidence only, Chinese content.
Not recommended for: Simple queries — use free_search instead.`,
    {
      query: z.string().describe('Search query'),
      count: z.number().optional().default(5).describe('Number of results (1-20)'),
      min_confidence: z.number().min(1).max(3).optional().default(1)
        .describe('Only return results verified by N+ sources'),
      time_range: z.enum(['day', 'week', 'month', 'year']).optional()
        .describe('Filter by recency'),
      language: z.enum(['auto', 'en', 'zh']).optional().default('auto')
        .describe('Language preference'),
      include_domains: z.array(z.string()).optional()
        .describe('Only search these domains'),
      exclude_domains: z.array(z.string()).optional()
        .describe('Exclude these domains'),
    },
    async (input) => {
      try {
        const results = await searchWithFallback({
          query: input.query,
          count: input.count,
          engines: ['duckduckgo', 'sogou', 'brave', 'tavily'],
          minConfidence: input.min_confidence,
          language: input.language,
          includeDomains: input.include_domains,
          excludeDomains: input.exclude_domains,
        });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );
}
