import { describe, it, expect } from 'vitest';
import { dedupByUrl, dedupByTitle, normalizeUrl } from '../src/aggregation/dedup.js';
import { scoreAndRank, ScoredResult } from '../src/aggregation/scorer.js';
import { formatResults } from '../src/aggregation/format.js';
import type { SearchResult } from '../src/types.js';

// ─── dedupByUrl ──────────────────────────────────────────────────────────

describe('dedupByUrl', () => {
  it('removes exact duplicate URLs', () => {
    const results: SearchResult[] = [
      { title: 'Foo', url: 'https://example.com/a', snippet: 'desc a', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Foo', url: 'https://example.com/a', snippet: 'desc a', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Bar', url: 'https://example.com/b', snippet: 'desc b', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const deduped = dedupByUrl(results);
    expect(deduped).toHaveLength(2);
    expect(deduped.map(r => r.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('treats URLs with different protocols and trailing slashes as the same host+path', () => {
    const results: SearchResult[] = [
      { title: 'A', url: 'https://Example.com/Path/', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'A', url: 'https://example.com/path', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const deduped = dedupByUrl(results);
    // normalizeUrl produces "example.com/path" for both
    expect(deduped).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(dedupByUrl([])).toEqual([]);
  });

  it('keeps first occurrence when URLs are duplicated', () => {
    const results: SearchResult[] = [
      { title: 'First', url: 'https://example.com/a', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Second', url: 'https://example.com/a', snippet: '', source: 'sogou', engines: ['sogou'] },
    ];
    const deduped = dedupByUrl(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].title).toBe('First');
  });
});

// ─── normalizeUrl ────────────────────────────────────────────────────────

describe('normalizeUrl', () => {
  it('lowercases hostname and path, strips trailing slash', () => {
    expect(normalizeUrl('HTTPS://EXAMPLE.COM/FOO/')).toBe('example.com/foo');
  });

  it('strips protocol and query string', () => {
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('example.com/a');
  });

  it('returns raw string for invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

// ─── dedupByTitle ────────────────────────────────────────────────────────

describe('dedupByTitle', () => {
  it('removes near-duplicate titles based on Jaccard similarity', () => {
    const results: SearchResult[] = [
      { title: 'Breaking News: AI Advances in 2025', url: 'https://example.com/1', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Breaking News: AI Advances in 2025', url: 'https://example.com/2', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const deduped = dedupByTitle(results, 0.85);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].url).toBe('https://example.com/1');
  });

  it('keeps different titles', () => {
    const results: SearchResult[] = [
      { title: 'Completely Different Topic', url: 'https://example.com/1', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Something Else Entirely', url: 'https://example.com/2', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const deduped = dedupByTitle(results, 0.85);
    expect(deduped).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(dedupByTitle([])).toEqual([]);
  });

  it('uses default threshold of 0.85', () => {
    const results: SearchResult[] = [
      { title: 'Same Title Here', url: 'https://example.com/1', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Same Title Here', url: 'https://example.com/2', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
    ];
    expect(dedupByTitle(results)).toHaveLength(1);
  });
});

// ─── scoreAndRank ────────────────────────────────────────────────────────

describe('scoreAndRank', () => {
  it('returns results sorted by confidence desc then score desc', () => {
    const results: SearchResult[] = [
      { title: 'Low', url: 'https://example.com/1', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'High', url: 'https://example.com/2', snippet: '', source: 'multi', engines: ['duckduckgo', 'sogou'] },
    ];
    const scored = scoreAndRank(results, 'test');
    expect(scored).toHaveLength(2);
    expect(scored[0].title).toBe('High'); // confidence=2 > 1
    expect(scored[0].confidence).toBe(2);
    expect(scored[1].confidence).toBe(1);
  });

  it('calculates score with query match bonus', () => {
    const results: SearchResult[] = [
      { title: 'Learning TypeScript Programming', url: 'https://example.com/ts', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
      { title: 'Plain Result', url: 'https://example.com/plain', snippet: '', source: 'ddg', engines: ['duckduckgo'] },
    ];
    const scored = scoreAndRank(results, 'typescript');
    // The first result has "TypeScript" in title matching "typescript"
    expect(scored[0].title).toBe('Learning TypeScript Programming');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it('applies engine weights', () => {
    const results: SearchResult[] = [
      { title: 'Test', url: 'https://example.com/1', snippet: '', source: 'sogou', engines: ['sogou'] },
    ];
    const weights = { sogou: 0.8 };
    const scored = scoreAndRank(results, 'test', weights);
    expect(scored[0].score).toBeLessThanOrEqual(1.0);
  });

  it('caps score at 1.0', () => {
    const results: SearchResult[] = [
      { title: 'Best Match Query Here', url: 'https://example.com/best', snippet: '', source: 'multi', engines: ['duckduckgo', 'sogou', 'brave', 'tavily'] },
    ];
    const scored = scoreAndRank(results, 'best match query here');
    expect(scored[0].score).toBeLessThanOrEqual(1.0);
  });

  it('returns empty array for empty input', () => {
    expect(scoreAndRank([], 'test')).toEqual([]);
  });
});

// ─── formatResults ──────────────────────────────────────────────────────

describe('formatResults', () => {
  it('truncates title and snippet to configured limits', () => {
    const scored: ScoredResult[] = [
      {
        title: 'A'.repeat(150),
        url: 'https://example.com',
        snippet: 'B'.repeat(300),
        source: 'ddg',
        engines: ['duckduckgo'],
        confidence: 1,
        score: 0.5,
      },
    ];
    const formatted = formatResults(scored);
    expect(formatted.results[0].title.length).toBeLessThanOrEqual(100);
    expect(formatted.results[0].snippet.length).toBeLessThanOrEqual(200);
  });

  it('builds meta with total, high_confidence, and unique engines', () => {
    const scored: ScoredResult[] = [
      { title: 'A', url: 'https://a.com', snippet: '', source: 'ddg', engines: ['duckduckgo', 'sogou'], confidence: 2, score: 0.7 },
      { title: 'B', url: 'https://b.com', snippet: '', source: 'ddg', engines: ['duckduckgo'], confidence: 1, score: 0.3 },
    ];
    const formatted = formatResults(scored);
    expect(formatted.meta).toEqual({
      total: 2,
      high_confidence: 1,
      engines: ['duckduckgo', 'sogou'],
    });
  });

  it('returns empty meta for empty results', () => {
    const formatted = formatResults([]);
    expect(formatted.meta).toEqual({ total: 0, high_confidence: 0, engines: [] });
    expect(formatted.results).toEqual([]);
  });
});
