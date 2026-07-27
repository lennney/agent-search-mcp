import { describe, expect, it } from 'vitest';

import { validateEvidenceHandoff } from '../../benchmarks/lib/evidence-handoff.mjs';

const validResponse = {
  query: 'cancellation retries',
  engines: ['duckduckgo', 'wikipedia'],
  results: [
    {
      title: 'Cancellation',
      url: 'https://example.com/cancellation',
      snippet: 'Cancellation signals stop retries.',
      confidence: 0.8,
      relevance: 0.9,
      source_count: 2,
      sources: ['duckduckgo', 'wikipedia'],
      evidence: {
        passage_score: 1.2,
        matched_terms: ['cancellation', 'retries'],
        published_at: null,
        extraction: 'search_snippet',
        source_chars: 36,
        selected_chars: 36,
      },
    },
    {
      title: 'Compact result',
      url: 'https://example.com/compact',
      compacted: true,
      sources: ['bing'],
    },
  ],
  meta: {
    total: 2,
    high_confidence: 1,
    engines: ['duckduckgo', 'wikipedia', 'bing'],
    evidence_budget: {
      unit: 'characters',
      limit: 1200,
      used: 36,
      truncated_results: 0,
    },
  },
  partialFailures: [{ engine: 'baidu', type: 'timeout', error: 'timed out' }],
};

describe('Slim Guard evidence handoff contract', () => {
  it('accepts full and compact Agent Search evidence packets', () => {
    expect(validateEvidenceHandoff(validResponse)).toEqual({ valid: true, errors: [] });
  });

  it('rejects compact packets that discard source provenance', () => {
    const invalid = structuredClone(validResponse);
    delete (invalid.results[1] as { sources?: string[] }).sources;

    const result = validateEvidenceHandoff(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('results[1].sources must contain at least one source');
  });

  it('rejects transformations that conflate confidence with corroboration', () => {
    const invalid = structuredClone(validResponse);
    invalid.results[0].source_count = 3;

    const result = validateEvidenceHandoff(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'results[0].source_count must equal unique provider-family count',
    );
  });

  it('rejects an inconsistent source count even on a compact packet', () => {
    const invalid = structuredClone(validResponse);
    (invalid.results[1] as { source_count?: number }).source_count = 2;

    const result = validateEvidenceHandoff(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'results[1].source_count must equal unique provider-family count',
    );
  });

  it('rejects duplicate source provenance', () => {
    const invalid = structuredClone(validResponse);
    invalid.results[1].sources = ['bing', 'bing'];

    const result = validateEvidenceHandoff(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('results[1].sources must contain unique non-empty strings');
  });

  it('counts DuckDuckGo and Bing as one upstream provider family', () => {
    const packet = structuredClone(validResponse);
    packet.results[0].sources = ['duckduckgo', 'bing'];
    packet.results[0].source_count = 1;

    expect(validateEvidenceHandoff(packet)).toEqual({ valid: true, errors: [] });
  });

  it('counts DuckDuckGo and Wikipedia as two upstream provider families', () => {
    const packet = structuredClone(validResponse);
    packet.results[0].sources = ['duckduckgo', 'wikipedia'];
    packet.results[0].source_count = 2;

    expect(validateEvidenceHandoff(packet)).toEqual({ valid: true, errors: [] });
  });
});
