import { describe, expect, it } from 'vitest';
import {
  createSearchEvidenceEvaluator,
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

describe('createSearchEvidenceEvaluator', () => {
  it('uses the same provider-family-aware basket for results and routing', () => {
    const evaluator = createSearchEvidenceEvaluator(policy({
      qualityGate: {
        minResults: 1,
        minAvgConfidence: 0,
        minRelevantResults: 1,
        minResultRelevance: 0,
        minProviderFamilies: 2,
        topK: 5,
      },
    }));
    const evaluation = evaluator.evaluate([
      result('https://example.com/guide', 'duckduckgo'),
      result('https://example.com/guide', 'bing'),
    ]);

    expect(evaluation.results).toHaveLength(1);
    expect(evaluation.results[0].source_count).toBe(1);
    expect(evaluation.qualityGate.providerFamilyCount).toBe(1);
    expect(evaluation.qualityGate.sufficient).toBe(false);
  });

  it('matches only exact domains and subdomains', () => {
    const evaluator = createSearchEvidenceEvaluator(
      policy({ includeDomains: ['https://example.com/reference'] }),
    );
    const evaluation = evaluator.evaluate([
      result('https://docs.example.com/guide', 'wikipedia'),
      result('https://notexample.com/guide', 'wikipedia'),
      result('https://example.com.evil.test/guide', 'wikipedia'),
    ]);

    expect(evaluation.results.map(item => item.url)).toEqual([
      'https://docs.example.com/guide',
    ]);
  });

  it('applies exclusion and result thresholds before the quality gate', () => {
    const evaluator = createSearchEvidenceEvaluator(policy({
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
    const evaluation = evaluator.evaluate([
      result('https://docs.example.com/guide', 'wikipedia'),
      result('https://blog.example.net/guide', 'bing'),
    ]);

    expect(evaluation.results.map(item => item.url)).toEqual([
      'https://blog.example.net/guide',
    ]);
    expect(evaluation.qualityGate.analyzedCount).toBe(1);
  });

  it('fails closed when every requested include-domain filter is invalid', () => {
    const evaluator = createSearchEvidenceEvaluator(
      policy({ includeDomains: ['://invalid'] }),
    );
    const evaluation = evaluator.evaluate([
      result('https://example.com/guide', 'wikipedia'),
    ]);

    expect(evaluation.results).toEqual([]);
    expect(evaluation.qualityGate.sufficient).toBe(false);
  });

  it('reassesses a transformed display basket with the same policy', () => {
    const evaluator = createSearchEvidenceEvaluator(policy({
      qualityGate: {
        minResults: 2,
        minAvgConfidence: 0,
        minRelevantResults: 2,
        minResultRelevance: 0,
        minProviderFamilies: 1,
        topK: 5,
      },
    }));
    const evaluation = evaluator.evaluate([
      result('https://example.com/a', 'wikipedia', 'Agent search evidence A'),
      result('https://example.net/b', 'bing', 'Agent search evidence B'),
    ]);

    expect(evaluation.qualityGate.sufficient).toBe(true);
    expect(evaluator.assess(evaluation.results.slice(0, 1)).sufficient).toBe(false);
  });
});
