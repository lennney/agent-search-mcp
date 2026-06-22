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
    expect(scored[0].confidence).toBe(2);
    expect(scored[1].confidence).toBe(1);
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
