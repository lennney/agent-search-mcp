import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchWithFallback } from './free-search.js';
import type { SearchWithFallbackOptions } from './free-search.js';
import { buildPromptHint } from '../synthesis/prompt-builder.js';
import type { SynthesisResult } from '../synthesis/prompt-builder.js';
import { logger } from '../infrastructure/logger.js';

export function registerSearchWithSynthesis(server: McpServer) {
  server.registerTool(
    'search_with_synthesis',
    {
      description:
        'Deep search with waterfall multi-engine verification. Returns structured results plus a prompt_hint for the agent to synthesize its own answer. No LLM required — zero API keys, zero external calls.\n\n' +
        'Best for: Complex queries needing multi-source verification and LLM synthesis.\n' +
        'Not recommended for: Simple fact-finding — use free_search instead.\n\n' +
        '@readOnly true @idempotent true — runs waterfall search across free+paid engines with content enrichment.',
      inputSchema: {
        query: z.string().describe('Search query'),
        count: z.number().optional().default(10).describe('Number of search results to gather (1-20)'),
        language: z.enum(['auto', 'en', 'zh']).optional().default('auto'),
        min_confidence: z.number().min(1).max(3).optional().default(1)
          .describe('Only return results verified by N+ sources'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input) => {
      try {
        const options: SearchWithFallbackOptions = {
          query: input.query,
          count: input.count,
          waterfall: true,
          enrich: true,
          minConfidence: input.min_confidence,
          language: input.language,
        };
        const response = await searchWithFallback(options);

        const rawResults = response.results || [];
        const engines = response.meta?.engines ?? [];

        const results: SynthesisResult[] = rawResults.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          confidence: r.confidence,
          source: engines[0] || 'unknown',
        }));

        const promptHint = buildPromptHint(input.query, results);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: input.query,
              results,
              prompt_hint: promptHint,
              meta: response.meta,
            }, null, 2),
          }],
        };
      } catch (error) {
        logger.error({ err: error instanceof Error ? error.message : String(error) }, 'search_with_synthesis failed');
        return {
          content: [{ type: 'text', text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );
}