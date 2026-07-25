import { describe, expect, it } from 'vitest';
import {
  evaluateSearchEvidence,
  type SearchEvidencePolicy,
} from '../../src/aggregation/search-evidence.js';
import type { SearchResult } from '../../src/types.js';

const ENGINE_WEIGHTS = {
  duckduckgo: 0.85,
  bing: 0.9,
  wikipedia: 0.93,
};

function result(
  url: string,
  source: string,
  title = 'Agent search evidence routing',
): SearchResult {
  return {
    title,
    url,
    snippet: 'Evidence-aware routing for agent search results and sources.',
    source,
    engines: [source],
  };
}

function policy(
  overrides: Partial<SearchEvidencePolicy> = {},
): SearchEvidencePolicy {
  return {
    query: 'agent search evidence',
    engineWeights: ENGINE_WEIGHTS,
    qualityGate: {
      minResults: 1,
      minAvgConfidence: 0,
      minRelevantResults: 1,
      minResultRelevance: 0,
      minProviderFamilies: 1,
      topK: 5,
    },
    ...overrides,
  };
}

describe('evaluateSearchEvidence', () => {
  it('uses the same provider-family-aware basket for results and routing', () => {
    const evaluation = evaluateSearchEvidence([
      result('https://example.com/guide', 'duckduckgo'),
      result('https://example.com/guide', 'bing'),
    ], policy({
      qualityGate: {
        minResults: 1,
        minAvgConfidence: 0,
        minRelevantResults: 1,
        minResultRelevance: 0,
        minProviderFamilies: 2,
        topK: 5,
      },
    }));

    expect(evaluation.results).toHaveLength(1);
    expect(evaluation.results[0].source_count).toBe(1);
    expect(evaluation.qualityGate.providerFamilyCount).toBe(1);
    expect(evaluation.qualityGate.sufficient).toBe(false);
  });

  it('matches only exact domains and subdomains', () => {
    const evaluation = evaluateSearchEvidence([
      result('https://docs.example.com/guide', 'wikipedia'),
      result('https://notexample.com/guide', 'wikipedia'),
      result('https://example.com.evil.test/guide', 'wikipedia'),
    ], policy({ includeDomains: ['https://example.com/reference'] }));

    expect(evaluation.results.map(item => item.url)).toEqual([
      'https://docs.example.com/guide',
    ]);
  });

  it('applies exclusion and result thresholds before the quality gate', () => {
    const evaluation = evaluateSearchEvidence([
      result('https://docs.example.com/guide', 'wikipedia'),
      result('https://blog.example.net/guide', 'bing'),
    ], policy({
      excludeDomains: ['example.com'],
      minConfidence: 0.8,
      qualityGate: {
        minResults: 1,
        minAvgConfidence: 0.8,
        minRelevantResults: 1,
        minResultRelevance: 0,
        minProviderFamilies: 1,
        topK: 5,
      },
    }));

    expect(evaluation.results.map(item => item.url)).toEqual([
      'https://blog.example.net/guide',
    ]);
    expect(evaluation.qualityGate.analyzedCount).toBe(1);
  });

  it('fails closed when every requested include-domain filter is invalid', () => {
    const evaluation = evaluateSearchEvidence([
      result('https://example.com/guide', 'wikipedia'),
    ], policy({ includeDomains: ['://invalid'] }));

    expect(evaluation.results).toEqual([]);
    expect(evaluation.qualityGate.sufficient).toBe(false);
  });
});
