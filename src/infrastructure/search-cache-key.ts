import { createHash } from 'node:crypto';

export const SEARCH_CACHE_KEY_VERSION = 'search-cache-key-v2';
export const SEARCH_EVIDENCE_SCHEMA_VERSION = 'search-evidence-packet-v1';
export const PROVIDER_POLICY_VERSION = 'provider-families-v1';

export interface SearchCacheKeyInput {
  request: {
    query: string;
    count: number;
    engines: string[];
    language: string;
    region: string;
    include_domains: string[];
    exclude_domains: string[];
    min_confidence: number;
    min_source_count: number;
  };
  strategy: {
    mode: 'parallel' | 'waterfall';
    /** Omitted for the production-default retry policy. */
    provider_max_retries?: number;
    waterfall_min_results: number;
    waterfall_min_confidence: number;
    expand_queries: boolean;
    enrich: boolean;
    enrich_max: number | null;
    enrich_min_confidence: number | null;
    semantic_dedup: boolean;
    dedup_threshold: number;
    dedup_model: string;
    semantic_rerank: boolean;
    rerank_top_k: number;
    rerank_model: string;
  };
  output: {
    style: 'normal' | 'compact';
    snippet_length: number;
    max_full_results: number;
    evidence_budget_chars: number;
    min_confidence: number;
    min_source_count: number;
  };
  provider_policy: {
    allowed_engines: string[];
    denied_engines: string[];
  };
  freshness: {
    ttl_ms: number;
  };
}

export function createSearchCacheKey(input: SearchCacheKeyInput): string {
  const envelope = {
    key_version: SEARCH_CACHE_KEY_VERSION,
    evidence_schema: SEARCH_EVIDENCE_SCHEMA_VERSION,
    provider_policy_version: PROVIDER_POLICY_VERSION,
    ...input,
  };
  const digest = createHash('sha256')
    .update(canonicalJson(envelope))
    .digest('hex');
  return `${SEARCH_CACHE_KEY_VERSION}:${digest}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
