import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchWithFallback } from './free-search.js';
import {
  type SearchRuntime,
} from '../infrastructure/search-runtime.js';
import {
  createSearchToolResult,
  searchOutputSchema,
} from './search-output.js';

export function registerFreeSearchAdvanced(
  server: McpServer,
  runtime?: SearchRuntime,
) {
  server.registerTool(
    'free_search_advanced',
    {
      description:
        `Advanced search with filters and quality control.

Best for: Domain filtering, high-confidence only, Chinese content.
Not recommended for: Simple queries — use free_search instead.

@readOnly true @idempotent true — runs waterfall progressive search across policy-allowed engines. ` +
        `Makes outbound HTTP requests to search engines and optionally to Jina Reader for content enrichment.`,
      inputSchema: {
        query: z.string().describe('Search query'),
        count: z.number().int().min(1).max(20).optional().default(5)
          .describe('Number of results (1-20)'),
        min_confidence: z.number().min(0).max(3).optional().default(0)
          .describe('Minimum source-reliability confidence (0-1). Legacy values 2-3 are treated as min_source_count.'),
        min_source_count: z.number().int().min(1).max(12).optional().default(1)
          .describe('Minimum independent upstream provider families; the input contract is capped at 12 for compatibility'),
        time_range: z.enum(['day', 'week', 'month', 'year']).optional()
          .describe('Deprecated compatibility field; returns UNSUPPORTED_FILTER because general-search recency is not enforced end to end'),
        language: z.enum(['auto', 'en', 'zh']).optional().default('auto')
          .describe('Language preference'),
        include_domains: z.array(z.string()).optional()
          .describe('Only search these domains'),
        exclude_domains: z.array(z.string()).optional()
          .describe('Exclude these domains'),
        waterfall: z.boolean().optional().default(true)
          .describe('Enable waterfall progressive search (saves engine calls)'),
        waterfall_min_results: z.number().min(1).max(10).optional().default(3)
          .describe('Minimum results per phase for waterfall confidence check'),
        waterfall_min_confidence: z.number().min(0.1).max(1.0).optional().default(0.6)
          .describe('Minimum average confidence to stop waterfall early'),
        enrich: z.boolean().optional().default(true)
          .describe('Enable content enrichment (extract full page for low-confidence results)'),
        enrich_max: z.number().min(1).max(10).optional().default(3)
          .describe('Max results to enrich per search'),
      },
      outputSchema: searchOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input, extra) => {
      try {
        if (input.time_range !== undefined) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 'UNSUPPORTED_FILTER',
                  field: 'time_range',
                  requested_value: input.time_range,
                  message:
                    'free_search_advanced.time_range is deprecated because the selected general-search adapters cannot enforce one cross-engine recency contract.',
                  suggestion:
                    'Remove time_range and verify publication dates in the returned sources.',
                },
              }, null, 2),
            }],
            isError: true,
          };
        }

        const legacySourceCount = input.min_confidence > 1 ? Math.ceil(input.min_confidence) : 1;
        const options = {
          query: input.query,
          count: input.count,
          minConfidence: input.min_confidence <= 1 ? input.min_confidence : 0,
          minSourceCount: Math.max(input.min_source_count, legacySourceCount),
          language: input.language,
          includeDomains: input.include_domains,
          excludeDomains: input.exclude_domains,
          waterfall: input.waterfall,
          waterfallMinResults: input.waterfall_min_results,
          waterfallMinConfidence: input.waterfall_min_confidence,
          enrich: input.enrich,
          enrichMax: input.enrich_max,
          signal: extra?.signal,
        };
        const results = runtime
          ? await searchWithFallback(options, runtime)
          : await searchWithFallback(options);
        return createSearchToolResult(results);
      } catch (error) {
        if (extra?.signal.aborted) throw error;
        return {
          content: [{ type: 'text', text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );
}
