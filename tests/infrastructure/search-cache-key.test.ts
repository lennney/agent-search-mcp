import { describe, expect, it } from 'vitest';

import {
  createSearchCacheKey,
  type SearchCacheKeyInput,
} from '../../src/infrastructure/search-cache-key.js';

function input(): SearchCacheKeyInput {
  return {
    request: {
      query: 'MCP search',
      count: 10,
      engines: ['duckduckgo', 'sogou'],
      language: 'auto',
      include_domains: [],
      exclude_domains: [],
      min_confidence: 0,
      min_source_count: 1,
    },
    strategy: {
      mode: 'parallel',
      waterfall_min_results: 3,
      waterfall_min_confidence: 0.6,
      expand_queries: true,
      enrich: false,
      enrich_max: null,
      enrich_min_confidence: null,
      semantic_dedup: false,
      dedup_threshold: 0.85,
      dedup_model: 'model-a',
      semantic_rerank: false,
      rerank_top_k: 5,
      rerank_model: 'model-a',
    },
    output: {
      style: 'normal',
      snippet_length: 200,
      max_full_results: 3,
      evidence_budget_chars: 1200,
      min_confidence: 0,
      min_source_count: 1,
    },
    provider_policy: {
      allowed_engines: [],
      denied_engines: [],
    },
    freshness: {
      ttl_ms: 60_000,
    },
  };
}

describe('createSearchCacheKey', () => {
  it('is deterministic and does not expose the query', () => {
    const first = createSearchCacheKey(input());
    expect(first).toBe(createSearchCacheKey(input()));
    expect(first).not.toContain('MCP search');
  });

  it.each([
    ['language', (value: SearchCacheKeyInput) => { value.request.language = 'zh'; }],
    ['strategy', (value: SearchCacheKeyInput) => { value.strategy.mode = 'waterfall'; }],
    ['filters', (value: SearchCacheKeyInput) => { value.request.include_domains = ['openai.com']; }],
    ['provider policy', (value: SearchCacheKeyInput) => { value.provider_policy.denied_engines = ['sogou']; }],
    ['evidence format', (value: SearchCacheKeyInput) => { value.output.evidence_budget_chars = 2400; }],
    ['freshness', (value: SearchCacheKeyInput) => { value.freshness.ttl_ms = 120_000; }],
  ])('partitions the cache by %s', (_label, mutate) => {
    const baseline = input();
    const changed = input();
    mutate(changed);
    expect(createSearchCacheKey(changed)).not.toBe(createSearchCacheKey(baseline));
  });
});
