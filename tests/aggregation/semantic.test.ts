import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScoredResult } from '../../src/aggregation/scorer.js';

// Mock child_process.spawn to simulate unavailable Python bridge.
// vi.mock is hoisted above imports, so this takes effect before semantic.ts loads.
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    throw new Error('Mock: python3 not available');
  }),
}));

import { semanticDedup, semanticRerank } from '../../src/aggregation/semantic.js';

function makeResults(n: number): ScoredResult[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Result ${i}`,
    url: `https://example.com/${i}`,
    snippet: `Snippet ${i} about some topic`,
    source: 'test',
    confidence: 0.9 - i * 0.1,
    score: 0.8 - i * 0.1,
  }));
}

describe('semanticDedup', () => {
  it('returns identity when bridge unavailable', async () => {
    const results = makeResults(5);
    const { results: out, removedCount } = await semanticDedup(results, 0.85);
    expect(out).toEqual(results);
    expect(removedCount).toBe(0);
  });

  it('handles empty results gracefully', async () => {
    const { results: out, removedCount } = await semanticDedup([], 0.85);
    expect(out).toEqual([]);
    expect(removedCount).toBe(0);
  });

  it('handles single result gracefully', async () => {
    const results = makeResults(1);
    const { results: out, removedCount } = await semanticDedup(results, 0.85);
    expect(out).toEqual(results);
    expect(removedCount).toBe(0);
  });
});

describe('semanticRerank', () => {
  it('returns identity when bridge unavailable', async () => {
    const results = makeResults(5);
    const out = await semanticRerank('query', results, 3);
    expect(out).toEqual(results);
  });

  it('handles empty results gracefully', async () => {
    const out = await semanticRerank('test', [], 3);
    expect(out).toEqual([]);
  });

  it('handles single result gracefully', async () => {
    const results = makeResults(1);
    const out = await semanticRerank('test', results, 3);
    expect(out).toEqual(results);
  });
});
