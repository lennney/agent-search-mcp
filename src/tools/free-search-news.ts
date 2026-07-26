import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchBingNews } from '../engines/bing.js';
import { classifyEngineError } from '../engines/engine-error.js';
import { logger } from '../infrastructure/logger.js';
import type { EngineError, SearchResult } from '../types.js';

export function registerFreeSearchNews(server: McpServer) {
  server.registerTool(
    'free_search_news',
    {
      description:
        'Search recent news through the zero-key Bing News RSS feed. Returns source, date, and snippet.\n\n' +
        'Best for: Recent news, current events, time-sensitive content.\n' +
        'Not recommended for: General web search — use free_search instead.\n\n' +
        '@readOnly true @idempotent true — makes one outbound HTTP request to Bing News RSS.',
      inputSchema: {
        query: z.string().describe('News search query'),
        count: z.number().int().min(1).max(20).optional().default(10).describe('Number of results (1-20)'),
        time_range: z.enum(['day', 'week', 'month']).optional().default('week')
          .describe('Maximum article age: 24 hours, 7 days, or 30 days; undated items are excluded'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input, extra) => {
      try {
        const results: SearchResult[] = [];
        const partialFailures: EngineError[] = [];

        try {
          const bingResults = await searchBingNews(input.query, input.count, {
            timeRange: input.time_range,
            signal: extra?.signal,
            throwOnError: true,
          });
          results.push(...bingResults);
        } catch (e) {
          extra?.signal?.throwIfAborted();
          logger.warn({ err: String(e) }, 'Bing News failed');
          partialFailures.push(classifyEngineError(
            'bing',
            e instanceof Error ? e : new Error(String(e)),
          ));
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: input.query,
              results: results.slice(0, input.count),
              meta: { total: results.length },
              ...(partialFailures.length > 0 ? { partialFailures } : {}),
            }, null, 2),
          }],
        };
      } catch (error) {
        if (extra?.signal.aborted) throw error;
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
