import { z } from 'zod';

const providerSchema = z.enum([
  'duckduckgo',
  'sogou',
  'bing',
  'baidu',
  'wikipedia',
  'startpage',
  'yandex',
  'mojeek',
  'brave',
  'tavily',
  'exa',
  'youcom',
]);

const routingGateSchema = z.object({
  sufficient: z.boolean(),
  basketConfidence: z.number().min(0).max(1),
  basketRelevance: z.number().min(0).max(1),
  relevantResultsCount: z.number().int().min(0),
  relevanceThreshold: z.number().min(0).max(1),
  providerFamilyCount: z.number().int().min(0),
  topResultsCount: z.number().int().min(0),
  analyzedCount: z.number().int().min(0),
});

const resultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  relevance: z.number().min(0).max(1).optional(),
  source_count: z.number().int().min(1).optional(),
  sources: z.array(z.string()).optional(),
  evidence: z.object({
    passage_score: z.number(),
    matched_terms: z.array(z.string()),
    published_at: z.string().nullable(),
    extraction: z.enum(['search_snippet', 'reader_extracted']),
    source_chars: z.number().int().min(0),
    selected_chars: z.number().int().min(0),
  }).optional(),
  security: z.object({
    injection_detected: z.boolean(),
    url_safe: z.boolean(),
    threats: z.array(z.string()),
    warnings: z.array(z.string()),
  }).optional(),
  compacted: z.boolean().optional(),
});

const engineErrorSchema = z.object({
  engine: z.string(),
  type: z.enum([
    'validation_error',
    'timeout',
    'upstream_4xx',
    'upstream_5xx',
    'rate_limited',
    'bot_challenge',
    'permission_denied',
    'budget_exhausted',
    'unknown',
  ]),
  message: z.string(),
  suggestion: z.string(),
});

/**
 * Stable machine-readable contract for the primary search tool. The text
 * content remains for older MCP clients; structuredContent is the canonical
 * parse-free representation for clients that support output schemas.
 */
export const searchOutputSchema = {
  query: z.string(),
  engines: z.array(providerSchema),
  results: z.array(resultSchema),
  meta: z.object({
    total: z.number().int().min(0),
    high_confidence: z.number().int().min(0),
    engines: z.array(z.string()),
    compacted_count: z.number().int().min(0).optional(),
    filtered_count: z.number().int().min(0).optional(),
    filtered_total: z.number().int().min(0).optional(),
    evidence_budget: z.object({
      unit: z.literal('characters'),
      limit: z.number().int().min(0),
      used: z.number().int().min(0),
      truncated_results: z.number().int().min(0),
    }).optional(),
    execution: z.object({
      mode: z.enum(['parallel', 'waterfall']),
      engine_calls: z.number().int().min(0),
      searched_engines: z.array(z.string()),
      phases_completed: z.array(z.string()),
      early_stop: z.boolean(),
      stop_reason: z.enum(['quality_gate_satisfied', 'phases_exhausted', 'budget_exhausted']),
      budget: z.object({
        limits: z.object({
          engine_calls: z.number().int().min(0),
          elapsed_ms: z.number().int().min(0),
          result_count: z.number().int().min(0),
          evidence_chars: z.number().int().min(0),
        }),
        observed: z.object({
          engine_calls: z.number().int().min(0),
          elapsed_ms: z.number().int().min(0),
          result_count: z.number().int().min(0),
          evidence_chars: z.number().int().min(0),
        }),
        exhausted: z.boolean(),
        exhausted_reasons: z.array(z.enum([
          'engine_calls',
          'elapsed_ms',
          'result_count',
          'evidence_chars',
        ])),
      }).optional(),
      quality_gate_stage: z.enum(['pre_semantic', 'post_semantic']).optional(),
      quality_gate: routingGateSchema.optional(),
    }).optional(),
  }),
  security_note: z.string(),
  detected_language: z.string().optional(),
  rate_limits: z.record(z.string(), z.object({
    remaining: z.number(),
    resetInMs: z.number(),
  })).optional(),
  partialFailures: z.array(engineErrorSchema).optional(),
  cache_hit: z.boolean().optional(),
};

interface SearchEvidencePacketLike {
  query: string;
  security_note: string;
  results: Array<{
    title: string;
    url: string;
    snippet?: string;
    confidence?: number;
    relevance?: number;
    source_count?: number;
    compacted?: boolean;
  }>;
  partialFailures?: Array<{ engine: string; type: string }>;
}

/**
 * Keep one canonical evidence object. Text is a compact human/model view for
 * clients that do not consume structuredContent; it is not a second contract.
 */
export function createSearchToolResult<T extends SearchEvidencePacketLike>(packet: T) {
  const lines = [
    `Search evidence for: ${packet.query}`,
    `Results: ${packet.results.length}`,
    packet.security_note,
  ];
  for (const [index, result] of packet.results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   ${result.url}`);
    if (result.snippet) lines.push(`   ${result.snippet}`);
    if (!result.compacted) {
      const signals = [
        result.relevance === undefined ? null : `relevance=${result.relevance}`,
        result.confidence === undefined ? null : `confidence=${result.confidence}`,
        result.source_count === undefined
          ? null
          : `provider_families=${result.source_count}`,
      ].filter((value): value is string => value !== null);
      if (signals.length > 0) lines.push(`   ${signals.join(' ')}`);
    }
  }
  if ((packet.partialFailures?.length ?? 0) > 0) {
    lines.push(
      `Partial failures: ${packet.partialFailures!
        .map(failure => `${failure.engine}:${failure.type}`)
        .join(', ')}`,
    );
  }
  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
    structuredContent: packet as unknown as Record<string, unknown>,
  };
}
