import { z } from 'zod';
import { SEARCH_PROVIDERS } from '../types.js';
import { createResultScope } from '../aggregation/result-scope.js';

const scope = z.array(z.string().min(1)).max(100).refine(values => {
  try { createResultScope(values); return true; } catch { return false; }
}, 'Expected a domain or HTTP(S) domain/path scope without query, fragment or credentials').optional();

const controls = {
  query: z.string().min(1),
  language: z.enum(['auto', 'en', 'zh']).optional(),
  engines: z.array(z.enum(SEARCH_PROVIDERS)).min(1).optional(),
  include_domains: scope.describe('Returned URLs only: domain (including subdomains) or domain/path boundary. Not a network egress restriction.'),
  exclude_domains: scope.describe('Exclude returned URL domains or domain/path subtrees; exclusion wins.'),
  query_mode: z.enum(['standard', 'literal']).default('standard').describe('literal sends the original query without local expansion, rewriting or relaxation; upstream interpretation is not controlled.'),
  privacy: z.enum(['standard', 'no_retention']).default('standard').describe('no_retention skips local query/result logs and caches. Upstream providers still see queries and may retain them.'),
  market: z.enum(['US', 'CN', 'MY', 'SG']).optional().describe('Explicit DDG market hint, independent of language. Other adapters do not enforce geography.'),
  time_range: z.enum(['day', 'week', 'month', 'year']).optional(),
  time_range_mode: z.literal('provider_native').optional().describe('Requires time_range and engines=[duckduckgo]. Upstream date hint only, not verified publication dates.'),
};

function consistentCount(input: { count?: number; limit?: number }): boolean {
  return input.count === undefined || input.limit === undefined || input.count === input.limit;
}

export const freeSearchInputSchema = z.strictObject({
  ...controls,
  limit: z.number().int().min(1).max(50).optional(),
  count: z.number().int().min(1).max(50).optional().describe('Alias for limit; conflicting values are rejected.'),
}).refine(consistentCount, 'count and limit conflict');

export const advancedSearchInputSchema = z.strictObject({
  ...controls,
  count: z.number().int().min(1).max(20).optional(),
  limit: z.number().int().min(1).max(20).optional().describe('Alias for count; conflicting values are rejected.'),
  min_confidence: z.number().min(0).max(3).default(0),
  min_source_count: z.number().int().min(1).max(12).default(1),
  language: z.enum(['auto', 'en', 'zh']).default('auto'),
  waterfall: z.boolean().default(true),
  waterfall_min_results: z.number().int().min(1).max(10).default(3),
  waterfall_min_confidence: z.number().min(0.1).max(1).default(0.6),
  enrich: z.boolean().default(true),
  enrich_max: z.number().int().min(1).max(10).default(3),
}).refine(consistentCount, 'count and limit conflict');
