import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchWithFallback } from './free-search.js';
import { rerankBySemantics } from '../aggregation/semantic-reranker.js';

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
      semantic: z.boolean().optional().default(false)
        .describe('Enable semantic reranking via embeddings (catches conceptually similar results)'),
      semantic_top_k: z.number().min(5).max(50).optional().default(20)
        .describe('Max results to semantically rerank (higher = more API cost)'),
    },
    async (input) => {
      try {
        const results = await searchWithFallback({
          query: input.query,
          count: input.count,
          engines: ['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily'],
          minConfidence: input.min_confidence,
          language: input.language,
          includeDomains: input.include_domains,
          excludeDomains: input.exclude_domains,
          waterfall: input.waterfall,
          waterfallMinResults: input.waterfall_min_results,
          waterfallMinConfidence: input.waterfall_min_confidence,
          enrich: input.enrich,
          enrichMax: input.enrich_max,
        });

        // Apply semantic reranking if requested
        if (input.semantic) {
          const reranked = await rerankBySemantics(input.query, results.results, {
            maxResults: input.semantic_top_k,
          });

          if (reranked.rerankedCount > 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      ...results,
                      results: reranked.reranked,
                      semantic: {
                        enabled: true,
                        rerankedCount: reranked.rerankedCount,
                        provider: reranked.provider,
                        model: reranked.model,
                      },
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }

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
