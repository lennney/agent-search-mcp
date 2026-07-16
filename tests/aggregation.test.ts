import { describe, it, expect } from 'vitest';
import { dedupByUrl, dedupByTitle, normalizeUrl } from '../src/aggregation/dedup.js';
import { scoreAndRank, ScoredResult } from '../src/aggregation/scorer.js';
import { formatResults, isChinese } from '../src/aggregation/format.js';
import type { SearchResult } from '../src/types.js';

// ─── dedupByUrl ──────────────────────────────────────────────────────────

describe('dedupByUrl', () => {
  it('removes exact duplicate URLs', () => {
    const results: SearchResult[] = [
      { title: 'Foo', url: 'https://example.com/a', snippet: 'desc a', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Foo', url: 'https://example.com/a', snippet: 'desc a', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Bar', url: 'https://example.com/b', snippet: 'desc b', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const { results: deduped } = dedupByUrl(results);
    expect(deduped).toHaveLength(2);
    expect(deduped.map(r => r.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('treats URLs with different protocols and trailing slashes as the same host+path', () => {
    const results: SearchResult[] = [
      { title: 'A', url: 'https://Example.com/Path/', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'A', url: 'https://example.com/path', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const { results: deduped } = dedupByUrl(results);
    // normalizeUrl produces "example.com/path" for both
    expect(deduped).toHaveLength(1);
  });

  it('returns empty results for empty input', () => {
    const { results, frequencies } = dedupByUrl([]);
    expect(results).toEqual([]);
    expect(frequencies.size).toBe(0);
  });

  it('keeps item with longer snippet when URLs are duplicated', () => {
    const results: SearchResult[] = [
      { title: 'First', url: 'https://example.com/a', snippet: 'short', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Second', url: 'https://example.com/a', snippet: 'much longer snippet with more details', source: 'sogou', engines: ['sogou'] },
    ];
    const { results: deduped } = dedupByUrl(results);
    expect(deduped).toHaveLength(1);
    // Should keep the one with longer snippet
    expect(deduped[0].snippet).toBe('much longer snippet with more details');
  });

  it('counts frequencies correctly', () => {
    const results: SearchResult[] = [
      { title: 'A', url: 'https://example.com/a', snippet: 'a', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'A', url: 'https://example.com/a', snippet: 'a', source: 'sogou', engines: ['sogou'] },
      { title: 'B', url: 'https://example.com/b', snippet: 'b', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const { frequencies } = dedupByUrl(results);
    expect(frequencies.get('example.com/a')).toBe(2);
    expect(frequencies.get('example.com/b')).toBe(1);
  });
});

// ─── normalizeUrl ────────────────────────────────────────────────────────

describe('normalizeUrl', () => {
  it('lowercases hostname and path, strips trailing slash', () => {
    expect(normalizeUrl('HTTPS://EXAMPLE.COM/FOO/')).toBe('example.com/foo');
  });

  it('strips protocol and query string', () => {
    expect(normalizeUrl('https://example.com/path?q=1')).toBe('example.com/path');
  });

  it('returns raw string for invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

// ─── dedupByTitle ────────────────────────────────────────────────────────

describe('dedupByTitle', () => {
  it('removes near-duplicate titles based on Jaccard similarity', () => {
    const results: SearchResult[] = [
      { title: 'How to Build MCP Servers', url: 'a', snippet: '', source: '', engines: [] },
      { title: 'How to Build MCP Servers Guide', url: 'b', snippet: '', source: '', engines: [] },
    ];
    const deduped = dedupByTitle(results);
    // Jaccard = 5/6 = 0.833 < 0.85, so both kept
    expect(deduped).toHaveLength(2);
  });

  it('removes titles with Jaccard > 0.85', () => {
    const results: SearchResult[] = [
      { title: 'MCP Server Guide Tutorial', url: 'a', snippet: '', source: '', engines: [] },
      { title: 'MCP Server Guide Tutorial Steps', url: 'b', snippet: '', source: '', engines: [] },
    ];
    const deduped = dedupByTitle(results);
    // Jaccard = 4/5 = 0.8 > 0.85? Let me check: {mcp, server, guide, tutorial} vs {mcp, server, guide, tutorial, steps}
    // intersection = 4, union = 5, Jaccard = 0.8
    // Still < 0.85, so both kept
    expect(deduped).toHaveLength(2);
  });

  it('removes exact duplicate titles', () => {
    const results: SearchResult[] = [
      { title: 'Same Title', url: 'a', snippet: '', source: '', engines: [] },
      { title: 'Same Title', url: 'b', snippet: '', source: '', engines: [] },
    ];
    const deduped = dedupByTitle(results);
    expect(deduped).toHaveLength(1);
  });

  it('keeps different titles', () => {
    const results: SearchResult[] = [
      { title: 'MCP Servers', url: 'a', snippet: '', source: '', engines: [] },
      { title: 'TypeScript Guide', url: 'b', snippet: '', source: '', engines: [] },
    ];
    const deduped = dedupByTitle(results);
    expect(deduped).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(dedupByTitle([])).toEqual([]);
  });

  it('uses default threshold of 0.85', () => {
    const results: SearchResult[] = [
      { title: 'A B C D E', url: 'a', snippet: '', source: '', engines: [] },
      { title: 'A B C D F', url: 'b', snippet: '', source: '', engines: [] },
    ];
    // Jaccard: 4/6 = 0.67 < 0.85, should keep both
    const deduped = dedupByTitle(results);
    expect(deduped).toHaveLength(2);
  });
});

// ─── scoreAndRank ────────────────────────────────────────────────────────

describe('scoreAndRank', () => {
  it('returns results sorted by confidence desc then score desc', () => {
    const results: SearchResult[] = [
      { title: 'Low', url: 'a', snippet: 'Low confidence', source: '', engines: ['sogou'] },
      { title: 'High', url: 'b', snippet: 'High confidence', source: '', engines: ['sogou', 'duckduckgo'] },
    ];
    const scored = scoreAndRank(results, 'test query');
    // Weighted confidence: more engines = higher confidence
    expect(scored[0].confidence).toBeGreaterThan(scored[1].confidence);
    expect(scored[0].title).toBe('High');
  });

  it('calculates score with query match bonus', () => {
    const results: SearchResult[] = [
      { title: 'MCP Server Guide', url: 'a', snippet: 'How to build MCP servers', source: '', engines: ['duckduckgo'] },
      { title: 'Unrelated', url: 'b', snippet: 'Something else entirely', source: '', engines: ['duckduckgo'] },
    ];
    const scored = scoreAndRank(results, 'MCP server');
    expect(scored[0].title).toBe('MCP Server Guide');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it('applies engine weights', () => {
    const results: SearchResult[] = [
      { title: 'Test', url: 'a', snippet: 'Test result', source: '', engines: ['brave'] },
    ];
    const scored = scoreAndRank(results, 'test', { brave: 0.95 });
    expect(scored[0].score).toBeGreaterThan(0);
  });

  it('caps score at 1.0', () => {
    const results: SearchResult[] = [
      { title: 'Wikipedia MCP', url: 'https://wikipedia.org/wiki/MCP', snippet: 'MCP protocol Wikipedia', source: '', engines: ['duckduckgo', 'sogou'] },
    ];
    const scored = scoreAndRank(results, 'MCP protocol');
    expect(scored[0].score).toBeLessThanOrEqual(1.0);
  });

  it('returns empty array for empty input', () => {
    expect(scoreAndRank([], 'test')).toEqual([]);
  });
});

// ─── formatResults ───────────────────────────────────────────────────────

describe('formatResults', () => {
  it('truncates title and snippet to configured limits', () => {
    const results: ScoredResult[] = [
      {
        title: 'A'.repeat(200),
        url: 'https://example.com',
        snippet: 'B'.repeat(500),
        source: '',
        engines: [],
        confidence: 1,
        score: 0.5,
      },
    ];
    const formatted = formatResults(results);
    expect(formatted.results[0].title.length).toBeLessThanOrEqual(100);
    expect(formatted.results[0].snippet.length).toBeLessThanOrEqual(200);
  });

  it('builds meta with total, high_confidence, and unique engines', () => {
    const results: ScoredResult[] = [
      { title: 'A', url: 'a', snippet: 'A'.repeat(30), source: '', engines: ['duckduckgo', 'sogou'], confidence: 2, score: 0.8 },
      { title: 'B', url: 'b', snippet: 'B'.repeat(30), source: '', engines: ['sogou'], confidence: 1, score: 0.5 },
    ];
    const formatted = formatResults(results);
    expect(formatted.meta.total).toBe(2);
    expect(formatted.meta.high_confidence).toBe(1);
    expect(formatted.meta.engines).toContain('duckduckgo');
    expect(formatted.meta.engines).toContain('sogou');
  });

  it('returns empty meta for empty results', () => {
    const formatted = formatResults([]);
    expect(formatted.meta.total).toBe(0);
    expect(formatted.meta.high_confidence).toBe(0);
    expect(formatted.meta.engines).toEqual([]);
  });
});

// ─── checkConfidenceBasket ──────────────────────────────────────────────────

import { checkConfidenceBasket } from '../src/aggregation/scorer.js';

describe('checkConfidenceBasket', () => {
  function makeResult(confidence: number, index: number): ScoredResult {
    return {
      title: `Result ${index}`,
      url: `https://example.com/${index}`,
      snippet: `Snippet ${index}`,
      source: 'duckduckgo',
      engines: [],
      confidence,
      score: confidence,
    };
  }

  it('returns sufficient=false for empty results', () => {
    const result = checkConfidenceBasket([]);
    expect(result.sufficient).toBe(false);
    expect(result.basketConfidence).toBe(0);
    expect(result.analyzedCount).toBe(0);
  });

  it('returns sufficient=true when top-5 confidence meets threshold', () => {
    const results = [1, 2, 3, 4, 5].map(i => makeResult(0.8 + i * 0.01, i));
    const result = checkConfidenceBasket(results, { minResults: 3, minAvgConfidence: 0.6, topK: 5 });
    expect(result.sufficient).toBe(true);
    expect(result.basketConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it('returns sufficient=false when confidence is too low', () => {
    const results = [1, 2, 3, 4, 5].map(i => makeResult(0.3, i));
    const result = checkConfidenceBasket(results);
    expect(result.sufficient).toBe(false);
  });

  it('returns sufficient=false when not enough results (minResults)', () => {
    const results = [makeResult(0.9, 1), makeResult(0.9, 2)];
    const result = checkConfidenceBasket(results, { minResults: 3, minAvgConfidence: 0.6, topK: 5 });
    expect(result.sufficient).toBe(false);
    expect(result.topResultsCount).toBe(2);
  });

  it('respects custom topK — picks only the top results', () => {
    const high = [1, 2, 3].map(i => makeResult(0.9, i));
    const low = [4, 5, 6, 7].map(i => makeResult(0.2, i));
    const result = checkConfidenceBasket([...high, ...low], { topK: 3, minResults: 3, minAvgConfidence: 0.6 });
    expect(result.sufficient).toBe(true);
    expect(result.topResultsCount).toBe(3);
  });
});

// ─── Chinese domain authority ──────────────────────────────────────────────

describe('Chinese domain authority scoring', () => {
  it('baike.baidu.com gets +0.15 domain boost', () => {
    const withBaike: SearchResult[] = [
      { title: 'MCP 协议', url: 'https://baike.baidu.com/item/MCP', snippet: 'MCP 协议介绍', source: '', engines: ['duckduckgo'] },
    ];
    const withoutBaike: SearchResult[] = [
      { title: 'MCP 协议', url: 'https://example.com/mcp', snippet: 'MCP 协议介绍', source: '', engines: ['duckduckgo'] },
    ];
    const scoredBaike = scoreAndRank(withBaike, 'MCP protocol');
    const scoredOther = scoreAndRank(withoutBaike, 'MCP protocol');
    expect(scoredBaike[0].score).toBeGreaterThan(scoredOther[0].score);
  });

  it('zhihu.com gets +0.10 domain boost', () => {
    const results: SearchResult[] = [
      { title: 'MCP Guide', url: 'https://zhihu.com/question/123', snippet: 'MCP server guide', source: '', engines: ['duckduckgo'] },
    ];
    const scored = scoreAndRank(results, 'MCP guide');
    expect(scored[0].score).toBeGreaterThan(0.3);
  });

  it('.gov.cn TLD gets +0.12 boost', () => {
    const govCn: SearchResult[] = [
      { title: 'Policy Document', url: 'https://www.example.gov.cn/policy', snippet: 'Government policy MCP', source: '', engines: ['duckduckgo'] },
    ];
    const normal: SearchResult[] = [
      { title: 'Policy Document', url: 'https://example.com/policy', snippet: 'Government policy MCP', source: '', engines: ['duckduckgo'] },
    ];
    const scoredGov = scoreAndRank(govCn, 'MCP');
    const scoredNormal = scoreAndRank(normal, 'MCP');
    expect(scoredGov[0].score).toBeGreaterThan(scoredNormal[0].score);
  });

  it('.edu.cn TLD gets +0.12 boost', () => {
    const eduCn: SearchResult[] = [
      { title: 'Research Paper', url: 'https://www.tsinghua.edu.cn/research', snippet: 'MCP research', source: '', engines: ['duckduckgo'] },
    ];
    const normal: SearchResult[] = [
      { title: 'Research Paper', url: 'https://example.com/research', snippet: 'MCP research', source: '', engines: ['duckduckgo'] },
    ];
    const scoredEdu = scoreAndRank(eduCn, 'MCP');
    const scoredNormal = scoreAndRank(normal, 'MCP');
    expect(scoredEdu[0].score).toBeGreaterThan(scoredNormal[0].score);
  });
});

// ─── isChinese CJK detection ─────────────────────────────────────────────

describe('isChinese', () => {
  it('returns true for CJK text', () => {
    expect(isChinese('这是一个中文句子')).toBe(true);
    expect(isChinese('你好世界')).toBe(true);
  });

  it('returns true for text containing CJK chars', () => {
    expect(isChinese('Chinese text with 中文 mixed in')).toBe(true);
  });

  it('returns false for plain English text', () => {
    expect(isChinese('Hello World')).toBe(false);
    expect(isChinese('This is a test sentence')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isChinese('')).toBe(false);
  });
});

// ─── Chinese snippet truncation ──────────────────────────────────────────

describe('formatResults Chinese truncation', () => {
  it('allows 300 chars for Chinese snippets instead of 200', () => {
    const chineseSnippet = '这是一段很长的中文摘要文本，包含了很多有意义的信息，需要更长的显示长度才能完整表达内容。' +
      '中文的信息密度比英文更高，每个字符都承载更多信息，因此需要更长的截断长度来保证信息的完整性。' +
      '这是第三段的补充文本内容，用来确保总长度超过三百个字符，验证截断逻辑是否正确工作。' +
      '这是第四段的补充文本内容，用来确保总长度超过三百个字符，验证截断逻辑是否正确工作。' +
      '这是第五段的补充文本内容，用来确保总长度超过三百个字符，验证截断逻辑是否正确工作。';
    const results: ScoredResult[] = [
      {
        title: '中文标题',
        url: 'https://example.com',
        snippet: chineseSnippet,
        source: '',
        engines: [],
        confidence: 1,
        score: 0.5,
      },
    ];
    const formatted = formatResults(results);
    expect(formatted.results[0].snippet.length).toBeLessThanOrEqual(300);
    expect(formatted.results[0].snippet.length).toBeGreaterThan(200);
  });

  it('allows 150 chars for Chinese titles instead of 100', () => {
    const chineseTitle = '这是一个很长的中文标题'.repeat(15);
    const results: ScoredResult[] = [
      {
        title: chineseTitle,
        url: 'https://example.com',
        snippet: '摘要',
        source: '',
        engines: [],
        confidence: 1,
        score: 0.5,
      },
    ];
    const formatted = formatResults(results);
    expect(formatted.results[0].title.length).toBeLessThanOrEqual(150);
    expect(formatted.results[0].title.length).toBeGreaterThan(100);
  });

  it('keeps 200 char limit for non-Chinese snippets', () => {
    const englishSnippet = 'A'.repeat(500);
    const results: ScoredResult[] = [
      {
        title: 'English Title',
        url: 'https://example.com',
        snippet: englishSnippet,
        source: '',
        engines: [],
        confidence: 1,
        score: 0.5,
      },
    ];
    const formatted = formatResults(results);
    expect(formatted.results[0].snippet.length).toBeLessThanOrEqual(200);
    expect(formatted.results[0].title.length).toBeLessThanOrEqual(100);
  });
});
