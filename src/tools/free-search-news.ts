import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchDuckduckgoNews } from '../engines/duckduckgo.js';
import { searchBingNews } from '../engines/bing.js';
import { logger } from '../infrastructure/logger.js';

export function registerFreeSearchNews(server: McpServer) {
  server.registerTool(
    'free_search_news',
    {
      description:
        'Search news articles across multiple free engines. Returns recent news with source, date, and snippet.\n\n' +
        'Best for: Recent news, current events, time-sensitive content.\n' +
        'Not recommended for: General web search — use free_search instead.\n\n' +
        '@readOnly true @idempotent true — makes outbound HTTP requests to DDG News + Bing News.',
      inputSchema: {
        query: z.string().describe('News search query'),
        count: z.number().int().min(1).max(20).optional().default(10).describe('Number of results (1-20)'),
        time_range: z.enum(['day', 'week', 'month']).optional().default('week').describe('Time range filter'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input) => {
      try {
        const results: any[] = [];

        try {
          const ddgResults = await searchDuckduckgoNews(input.query, input.count, input.time_range);
          results.push(...ddgResults);
        } catch (e) {
          logger.warn({ err: String(e) }, 'DDG News failed, falling back');
        }

        if (results.length < input.count) {
          try {
            const bingResults = await searchBingNews(input.query, input.count);
            results.push(...bingResults);
          } catch (e) {
            logger.warn({ err: String(e) }, 'Bing News failed');
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: input.query,
              results: results.slice(0, input.count),
              meta: { total: results.length },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `News search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          isError: true,
        };
      }
    }
  );
}
