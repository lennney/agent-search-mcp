import { advancedSearchInputSchema } from './search-input.js';
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
        `Verification-oriented search with domain filters and waterfall fallback.

Use for claim checking, Chinese-source search, or publisher restrictions. Start with free_search for quick discovery. The response exposes source_count, stop_reason, evidence_budget, and partialFailures.

@readOnly true @idempotent true — runs waterfall progressive search across policy-allowed engines. ` +
        `Makes outbound HTTP requests to search engines and optionally to Jina Reader for content enrichment.`,
      inputSchema: advancedSearchInputSchema,
      outputSchema: searchOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (rawInput, extra) => {
      try {
        const input = advancedSearchInputSchema.parse(rawInput);
        if (input.time_range !== undefined && input.time_range_mode !== 'provider_native') {
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
          count: input.count ?? input.limit ?? 5,
          engines: input.engines,
          queryMode: input.query_mode,
          privacy: input.privacy,
          market: input.market,
          timeRange: input.time_range,
          timeRangeMode: input.time_range_mode,
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
