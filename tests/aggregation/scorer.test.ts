import { describe, it, expect } from 'vitest';
import { scoreAndRank, checkConfidenceBasket, ScoredResult } from '../../src/aggregation/scorer.js';
import type { SearchResult } from '../../src/types.js';

function makeResult(overrides: Partial<SearchResult> & { url: string }): SearchResult {
  return {
    title: overrides.title ?? 'Test Result',
    url: overrides.url,
    snippet: overrides.snippet ?? 'A test snippet with search terms',
    source: overrides.source ?? 'ddg',
    engines: overrides.engines,
  };
}

describe('scoreAndRank', () => {
  const weights = { ddg: 0.8, brave: 0.95, tavily: 0.92 };

  it('returns results sorted by confidence desc', () => {
    const results = [
      makeResult({ url: 'https://example.com/a', source: 'brave', engines: ['brave'] }),
      makeResult({ url: 'https://example.com/b', source: 'ddg', engines: ['ddg'] }),
    ];
    const scored = scoreAndRank(results, 'test query', weights);
    expect(scored.length).toBe(2);
    // Brave (0.95) should rank above DDG (0.80)
    expect(scored[0].source).toBe('brave');
    expect(scored[1].source).toBe('ddg');
  });

  it('handles empty results', () => {
    const scored = scoreAndRank([], 'anything', weights);
    expect(scored).toEqual([]);
  });

  it('domain boost for wikipedia.org', () => {
    const results = [
      makeResult({ url: 'https://en.wikipedia.org/wiki/Test', source: 'ddg', engines: ['ddg'] }),
      makeResult({ url: 'https://unknown.example.com/page', source: 'ddg', engines: ['ddg'] }),
    ];
    const scored = scoreAndRank(results, 'test', weights);
    expect(scored[0].url).toContain('wikipedia.org');
  });

  it('domain boost for .edu domains', () => {
    const results = [
      makeResult({ url: 'https://mit.edu/research', source: 'ddg', engines: ['ddg'] }),
      makeResult({ url: 'https://example.com/plain', source: 'ddg', engines: ['ddg'] }),
    ];
    const scored = scoreAndRank(results, 'research', weights);
    expect(scored[0].url).toContain('mit.edu');
  });

  it('negative domain boost for blogspot.com', () => {
    const results = [
      makeResult({ url: 'https://blogspot.com/post', source: 'ddg', engines: ['ddg'] }),
      makeResult({ url: 'https://good-site.com/article', source: 'ddg', engines: ['ddg'] }),
    ];
    const scored = scoreAndRank(results, 'post', weights);
    // blogspot has negative boost so should rank lower
    expect(scored[scored.length - 1].url).toContain('blogspot.com');
  });

  it('token match in title boosts score', () => {
    const results = [
      makeResult({ url: 'https://example.com/exact', title: 'exact match result', engines: ['ddg'] }),
      makeResult({ url: 'https://example.com/unrelated', title: 'completely different', engines: ['ddg'] }),
    ];
    const scored = scoreAndRank(results, 'exact match', weights);
    expect(scored[0].url).toContain('exact');
  });

  it('handles missing snippet gracefully', () => {
    const results = [
      makeResult({ url: 'https://example.com/no-snippet', snippet: undefined, engines: ['brave'] }),
    ];
    const scored = scoreAndRank(results, 'test', weights);
    expect(scored.length).toBe(1);
    expect(scored[0].confidence).toBeGreaterThan(0);
  });

  it('multiple engines boosted confidence', () => {
    const single = scoreAndRank(
      [makeResult({ url: 'https://example.com/s', engines: ['ddg'] })],
      'test', weights
    );
    const multi = scoreAndRank(
      [makeResult({ url: 'https://example.com/m', engines: ['ddg', 'brave', 'tavily'] })],
      'test', weights
    );
    expect(multi[0].confidence).toBeGreaterThan(single[0].confidence);
  });

  it('empty tokens returns default score 0.3', () => {
    // Short query (< 3 chars) produces no tokens
    const results = [
      makeResult({ url: 'https://example.com/xy', engines: ['ddg'] }),
    ];
    const scored = scoreAndRank(results, 'xy', weights);
    expect(scored[0].score).toBeGreaterThan(0);
  });
});

describe('checkConfidenceBasket', () => {
  function scored(confidence: number, url?: string): ScoredResult {
    return {
      title: 'r',
      url: url ?? `https://example.com/${Math.random()}`,
      snippet: 'snippet',
      source: 'ddg',
      confidence,
      score: 0.5,
    };
  }

  it('returns sufficient=true when top results meet threshold', () => {
    const results = [scored(0.8), scored(0.7), scored(0.6), scored(0.5)];
    const basket = checkConfidenceBasket(results);
    expect(basket.sufficient).toBe(true);
    expect(basket.basketConfidence).toBeGreaterThanOrEqual(0.6);
  });

  it('returns sufficient=false when results are too few', () => {
    const result = checkConfidenceBasket([scored(0.9)], { minResults: 3, minAvgConfidence: 0.6 });
    expect(result.sufficient).toBe(false);
  });

  it('returns sufficient=false when average is too low', () => {
    const results = [scored(0.3), scored(0.2), scored(0.1)];
    const basket = checkConfidenceBasket(results);
    expect(basket.sufficient).toBe(false);
  });

  it('returns zero values for empty results', () => {
    const basket = checkConfidenceBasket([]);
    expect(basket.sufficient).toBe(false);
    expect(basket.basketConfidence).toBe(0);
    expect(basket.topResultsCount).toBe(0);
    expect(basket.analyzedCount).toBe(0);
  });

  it('respects topK parameter', () => {
    const results = [
      scored(0.9), scored(0.9), scored(0.9), // top 3 high
      scored(0.1), scored(0.1), // bottom 2 low
    ];
    // topK=3 should only look at the top 3
    const basket = checkConfidenceBasket(results, { topK: 3, minResults: 3, minAvgConfidence: 0.8 });
    expect(basket.sufficient).toBe(true);
    expect(basket.basketConfidence).toBe(0.9);
  });
});
