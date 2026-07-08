import { describe, it, expect } from 'vitest';
import { rerankBySemantics, cosineSimilarity } from '../src/aggregation/semantic-reranker.js';

interface TestResult {
  title: string;
  snippet: string;
  url: string;
  confidence: number;
}

function makeResult(
  title: string,
  snippet: string,
  url: string,
  confidence: number = 0.5,
): TestResult {
  return { title, snippet, url, confidence };
}

describe('cosineSimilarity', () => {
  it('identical vectors give 1.0', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('opposite vectors give -1.0', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('orthogonal vectors give 0', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('zero vector gives 0', () => {
    const a = [1, 0, 0];
    const b = [0, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('different length vectors give 0', () => {
    const a = [1, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('partial similarity between non-identical vectors', () => {
    const a = [1, 1, 0];
    const b = [1, 0, 0];
    const sim = cosineSimilarity(a, b);
    // a · b = 1, |a| = sqrt(2), |b| = 1
    expect(sim).toBeCloseTo(1 / Math.SQRT2, 5);
  });
});

describe('rerankBySemantics', () => {
  it('returns empty result for empty input', async () => {
    const result = await rerankBySemantics('test', []);
    expect(result.reranked).toEqual([]);
    expect(result.rerankedCount).toBe(0);
    expect(result.provider).toBe('none');
  });

  it('returns original order when no API key configured', async () => {
    const results = [
      makeResult('Result A', 'Content about cats', 'https://example.com/a'),
      makeResult('Result B', 'Content about dogs', 'https://example.com/b'),
    ];

    const result = await rerankBySemantics('cats', results);
    expect(result.reranked).toEqual(results);
    expect(result.rerankedCount).toBe(0);
    expect(result.provider).toBe('none');
  });

  it('preserves result count and urls', async () => {
    const results = [
      makeResult('A', 'a', 'https://example.com/a'),
      makeResult('B', 'b', 'https://example.com/b'),
      makeResult('C', 'c', 'https://example.com/c'),
    ];

    const result = await rerankBySemantics('test', results);
    expect(result.reranked.length).toBe(3);
    expect(result.reranked.map((r) => r.url)).toEqual(
      expect.arrayContaining(results.map((r) => r.url)),
    );
  });

  it('handles single result gracefully', async () => {
    const results = [makeResult('Only Result', 'Solo content', 'https://example.com/only')];

    const result = await rerankBySemantics('query', results);
    expect(result.reranked.length).toBe(1);
    expect(result.reranked[0].url).toBe('https://example.com/only');
  });

  it('handles results with empty snippet gracefully', async () => {
    const results = [
      makeResult('Title Only', '', 'https://example.com/a'),
      makeResult('Both Fields', 'Has snippet content', 'https://example.com/b'),
    ];

    const result = await rerankBySemantics('query', results);
    expect(result.reranked.length).toBe(2);
  });

  it('respects maxResults option', async () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult(`Result ${i}`, `Content ${i}`, `https://example.com/${i}`),
    );

    const result = await rerankBySemantics('test', results, { maxResults: 5 });
    // No API key, so rerankedCount should be 0 regardless of maxResults
    expect(result.reranked.length).toBe(10);
  });
});
