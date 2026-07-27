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

  it('ranks broader query-term coverage above a one-term partial match', () => {
    const results = [
      makeResult({
        url: 'https://example.com/exact',
        title: 'Model Context Protocol',
        snippet: 'The Model Context Protocol connects AI applications to tools and data.',
        engines: ['ddg'],
      }),
      makeResult({
        url: 'https://example.com/partial',
        title: 'Communication protocol',
        snippet: 'A protocol defines communication rules.',
        engines: ['ddg'],
      }),
    ];

    const scored = scoreAndRank(results, 'What is the Model Context Protocol?', weights);

    expect(scored[0].url).toContain('exact');
    expect(scored[0].relevance).toBeGreaterThan(scored[1].relevance);
  });

  it('uses CJK query terms when ranking Chinese results', () => {
    const results = [
      makeResult({
        url: 'https://example.com/transformer',
        title: 'Transformer 模型',
        snippet: 'Transformer 模型使用注意力机制处理序列。',
        engines: ['ddg'],
      }),
      makeResult({
        url: 'https://example.com/chat',
        title: '聊天机器人',
        snippet: '介绍通用聊天应用。',
        engines: ['ddg'],
      }),
    ];

    const scored = scoreAndRank(results, 'Transformer 模型是什么？', weights);

    expect(scored[0].url).toContain('transformer');
    expect(scored[0].relevance).toBeGreaterThan(scored[1].relevance);
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
    expect(multi[0].source_count).toBe(3);
    expect(single[0].source_count).toBe(1);
  });

  it('does not treat duplicate rows from one adapter as independent sources', () => {
    const frequencies = new Map([['example.com/same', 3]]);
    const scored = scoreAndRank(
      [makeResult({ url: 'https://example.com/same', engines: ['ddg'] })],
      'test', weights, frequencies
    );
    expect(scored[0].source_count).toBe(1);
  });

  it('does not treat adapters from the same provider family as independent sources', () => {
    const scored = scoreAndRank(
      [makeResult({
        url: 'https://example.com/same-family',
        engines: ['duckduckgo', 'bing'],
      })],
      'test',
      { duckduckgo: 0.8, bing: 0.9 },
    );

    expect(scored[0].source_count).toBe(1);
    expect(scored[0].confidence).toBe(0.9);
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
      relevance: 0.5,
      source_count: 1,
      score: 0.5,
    };
  }

  it('returns sufficient=true when top results meet confidence and relevance thresholds', () => {
    const results = [scored(0.8), scored(0.7), scored(0.6), scored(0.5)];
    const basket = checkConfidenceBasket(results);
    expect(basket.sufficient).toBe(true);
    expect(basket.basketConfidence).toBeGreaterThanOrEqual(0.6);
    expect(basket.basketRelevance).toBe(0.5);
    expect(basket.relevantResultsCount).toBe(4);
  });

  it('does not stop early for high-confidence results with low query relevance', () => {
    const results = [
      { ...scored(0.9), relevance: 0.1, score: 0.1 },
      { ...scored(0.9), relevance: 0.1, score: 0.1 },
      { ...scored(0.9), relevance: 0.1, score: 0.1 },
    ];

    const basket = checkConfidenceBasket(results);

    expect(basket.sufficient).toBe(false);
    expect(basket.basketConfidence).toBe(0.9);
    expect(basket.basketRelevance).toBe(0.1);
    expect(basket.relevantResultsCount).toBe(0);
  });

  it('treats missing relevance as absent evidence', () => {
    const legacyResults = [scored(0.9), scored(0.9), scored(0.9)].map((result) => {
      const { relevance: _relevance, ...legacyResult } = result;
      return legacyResult as ScoredResult;
    });

    const basket = checkConfidenceBasket(legacyResults);

    expect(basket.sufficient).toBe(false);
    expect(basket.basketRelevance).toBe(0);
    expect(basket.relevantResultsCount).toBe(0);
  });

  it('requires enough individually relevant results and accepts a stricter override', () => {
    const results = [
      { ...scored(0.9), relevance: 0.35, score: 0.35 },
      { ...scored(0.9), relevance: 0.35, score: 0.35 },
      { ...scored(0.9), relevance: 0.1, score: 0.1 },
    ];

    expect(checkConfidenceBasket(results).sufficient).toBe(false);
    expect(checkConfidenceBasket(results, { minRelevantResults: 2 }).sufficient).toBe(true);
    expect(checkConfidenceBasket(results, {
      minRelevantResults: 2,
      minResultRelevance: 0.36,
    }).sufficient).toBe(false);
  });

  it('requires independent provider families when requested', () => {
    const sameFamily = [
      { ...scored(0.9), source: 'duckduckgo', engines: ['duckduckgo'] },
      { ...scored(0.9), source: 'bing', engines: ['bing'] },
      { ...scored(0.9), source: 'duckduckgo', engines: ['duckduckgo'] },
    ];
    const independent = [
      ...sameFamily.slice(0, 2),
      { ...scored(0.9), source: 'sogou', engines: ['sogou'] },
    ];

    expect(checkConfidenceBasket(sameFamily, {
      minProviderFamilies: 2,
    }).sufficient).toBe(false);
    expect(checkConfidenceBasket(independent, {
      minProviderFamilies: 2,
    }).sufficient).toBe(true);
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

  it('treats invalid confidence values as absent evidence', () => {
    const results = [
      scored(Number.NaN),
      scored(Number.POSITIVE_INFINITY),
      scored(1.1),
    ];

    const basket = checkConfidenceBasket(results);

    expect(basket.sufficient).toBe(false);
    expect(basket.basketConfidence).toBe(0);
  });

  it('returns zero values for empty results', () => {
    const basket = checkConfidenceBasket([]);
    expect(basket.sufficient).toBe(false);
    expect(basket.basketConfidence).toBe(0);
    expect(basket.basketRelevance).toBe(0);
    expect(basket.relevantResultsCount).toBe(0);
    expect(basket.relevanceThreshold).toBe(0.35);
    expect(basket.providerFamilyCount).toBe(0);
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
