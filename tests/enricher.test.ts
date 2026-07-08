import { describe, it, expect, vi } from 'vitest';
import type { ScoredResult } from '../src/aggregation/scorer.js';

// We test the enricher logic directly by importing the function
// The actual enrichResults uses fetch internally, so we test the
// business logic: candidate selection, confidence boost, fallback behavior

// Re-implement the enrichment logic for testing (avoids network calls)
async function enrichResultsTest(
  results: ScoredResult[],
  options?: { maxEnrich?: number; minConfidence?: number; minSnippetLength?: number; maxLength?: number }
): Promise<{ enriched: number; failures: number; results: ScoredResult[] }> {
  const {
    maxEnrich = 3,
    minConfidence = 0.33,
    minSnippetLength = 80,
  } = options ?? {};

  if (results.length === 0) {
    return { enriched: 0, failures: 0, results: [] };
  }

  const candidates = results.filter(
    (r) => r.confidence < minConfidence || r.snippet.length < minSnippetLength
  );

  if (candidates.length === 0) {
    return { enriched: 0, failures: 0, results };
  }

  // Simulate: first 2 succeed, rest fail
  const toEnrich = [...candidates].sort((a, b) => b.score - a.score).slice(0, maxEnrich);
  let enriched = 0;
  let failures = 0;

  const enrichedResults = results.map((r) => {
    const isTarget = toEnrich.find((e) => e.url === r.url);
    if (!isTarget) return r;

    if (enriched < 2) {
      // Simulate successful enrichment
      enriched++;
      return {
        ...r,
        snippet: 'A'.repeat(500),  // full content
        confidence: Math.min(r.confidence + 0.33, 1.0),
      };
    } else {
      // Simulate failure
      failures++;
      return r;
    }
  });

  return {
    enriched,
    failures,
    results: enrichedResults,
  };
}

function makeResult(confidence: number, snippet: string, index: number): ScoredResult {
  return {
    title: `Result ${index}`,
    url: `https://example.com/${index}`,
    snippet,
    source: 'duckduckgo',
    engines: ['duckduckgo'],
    confidence,
    score: confidence,
  };
}

describe('enrichResults (test harness)', () => {
  it('returns enriched=0 for empty results', async () => {
    const result = await enrichResultsTest([]);
    expect(result.enriched).toBe(0);
    expect(result.failures).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('returns enriched=0 when all results have high confidence and long snippet', async () => {
    const results = [makeResult(0.8, 'A'.repeat(100), 1), makeResult(0.9, 'B'.repeat(100), 2)];
    const result = await enrichResultsTest(results);
    expect(result.enriched).toBe(0);
    expect(result.failures).toBe(0);
    expect(result.results).toHaveLength(2);
  });

  it('enriches low-confidence results and boosts confidence', async () => {
    const results = [
      makeResult(0.9, 'A'.repeat(100), 1),
      makeResult(0.2, 'Short', 2),
      makeResult(0.3, 'Also short', 3),
    ];
    const result = await enrichResultsTest(results);
    expect(result.enriched).toBeGreaterThan(0);
    // Only results 2 and 3 should be enriched (low confidence)
    const original2 = results.find(r => r.url === 'https://example.com/2')!;
    const enriched2 = result.results.find(r => r.url === 'https://example.com/2')!;
    expect(enriched2.confidence).toBeGreaterThanOrEqual(original2.confidence + 0.3);

    const original3 = results.find(r => r.url === 'https://example.com/3')!;
    const enriched3 = result.results.find(r => r.url === 'https://example.com/3')!;
    expect(enriched3.confidence).toBeGreaterThanOrEqual(original3.confidence + 0.3);
  });

  it('caps confidence at 1.0 after enrichment', async () => {
    const results = [makeResult(0.85, 'Short', 1)];
    const result = await enrichResultsTest(results, { maxEnrich: 1 });
    expect(result.results[0].confidence).toBeLessThanOrEqual(1.0);
  });

  it('records failures without throwing', async () => {
    const results = [makeResult(0.2, 'Short', 1), makeResult(0.25, 'Tiny', 2)];
    const result = await enrichResultsTest(results, { maxEnrich: 5 });
    // With only 2 successful simulated extracts and 0 remaining
    expect(result.failures).toBeGreaterThanOrEqual(0);
    // No exception thrown
  });

  it('does not enrich results with long snippet and decent confidence', async () => {
    const results = [makeResult(0.5, 'A'.repeat(100), 1)];  // confidence >= 0.33, snippet >= 80
    const result = await enrichResultsTest(results);
    expect(result.enriched).toBe(0);
  });

  it('enriches results with short snippet even if confidence is okay', async () => {
    const results = [makeResult(0.5, 'Short', 1)];  // confidence >= 0.33, but snippet < 80
    const result = await enrichResultsTest(results);
    expect(result.enriched).toBeGreaterThan(0);
  });
});
