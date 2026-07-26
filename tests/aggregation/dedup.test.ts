import { describe, it, expect } from 'vitest';
import {
  PROVIDER_FAMILIES,
  normalizeUrl,
  dedupByUrl,
  dedupByTitle,
  filterLowQuality,
} from '../../src/aggregation/dedup.js';
import { readFileSync } from 'node:fs';
import type { SearchResult } from '../../src/types.js';

function r(overrides: Partial<SearchResult> & { url: string }): SearchResult {
  return {
    title: overrides.title ?? 'Test',
    url: overrides.url,
    snippet: overrides.snippet ?? 'A snippet with enough content to pass the quality filter.',
    source: overrides.source ?? 'ddg',
    engines: overrides.engines ?? ['ddg'],
  };
}

describe('normalizeUrl', () => {
  it('strips protocol and trailing slash', () => {
    expect(normalizeUrl('https://Example.com/Path/')).toBe('example.com/path');
  });
  it('handles invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('dedupByUrl', () => {
  it('keeps unique URLs', () => {
    const results = [r({ url: 'https://a.com/1' }), r({ url: 'https://b.com/2' })];
    const { results: deduped } = dedupByUrl(results);
    expect(deduped).toHaveLength(2);
  });

  it('deduplicates same URL keeping richer snippet', () => {
    const results = [
      r({ url: 'https://a.com/1', snippet: 'short' }),
      r({ url: 'https://a.com/1', snippet: 'a much longer and richer snippet here' }),
    ];
    const { results: deduped } = dedupByUrl(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].snippet).toBe('a much longer and richer snippet here');
  });

  it('counts independent provider families per URL', () => {
    const results = [
      r({ url: 'https://a.com/1' }),
      r({ url: 'https://a.com/1' }),
      r({ url: 'https://b.com/2' }),
    ];
    const { frequencies } = dedupByUrl(results);
    expect(frequencies.get('a.com/1')).toBe(1);
    expect(frequencies.get('b.com/2')).toBe(1);
  });

  it('does not count DuckDuckGo and Bing as independent corroboration', () => {
    const { frequencies } = dedupByUrl([
      r({ url: 'https://a.com/1', source: 'duckduckgo', engines: ['duckduckgo'] }),
      r({ url: 'https://a.com/1', source: 'bing', engines: ['bing'] }),
      r({ url: 'https://a.com/1', source: 'sogou', engines: ['sogou'] }),
    ]);

    expect(frequencies.get('a.com/1')).toBe(2);
  });

  it('does not inflate confidence across the new same-family adapters', () => {
    const { frequencies } = dedupByUrl([
      r({ url: 'https://a.com/1', engines: ['sogou'] }),
      r({ url: 'https://a.com/1', engines: ['tencent_wsa'] }),
      r({ url: 'https://a.com/1', engines: ['startpage'] }),
      r({ url: 'https://a.com/1', engines: ['serper'] }),
    ]);

    expect(frequencies.get('a.com/1')).toBe(2);
  });
});

describe('provider-family contract', () => {
  it('matches the machine-readable Slim Guard handoff mapping', () => {
    const contract = JSON.parse(readFileSync(
      new URL(
        '../../docs/contracts/provider-families-v1.json',
        import.meta.url,
      ),
      'utf8',
    ));

    expect(PROVIDER_FAMILIES).toEqual(contract.families);
  });
});

describe('dedupByTitle', () => {
  it('keeps unique titles', () => {
    const results = [
      r({ url: 'https://a.com', title: 'Hello World' }),
      r({ url: 'https://b.com', title: 'Another Page' }),
    ];
    expect(dedupByTitle(results)).toHaveLength(2);
  });

  it('deduplicates very similar titles (Jaccard > 0.85)', () => {
    const results = [
      r({ url: 'https://a.com', title: 'Breaking News Today' }),
      r({ url: 'https://b.com', title: 'Breaking News Today' }),
    ];
    expect(dedupByTitle(results)).toHaveLength(1);
  });

  it('keeps titles with moderate differences (Jaccard < 0.85)', () => {
    const results = [
      r({ url: 'https://a.com', title: 'Breaking News Today' }),
      r({ url: 'https://b.com', title: 'Breaking News Today Update' }),
    ];
    expect(dedupByTitle(results)).toHaveLength(2);
  });

  it('passes results with different titles', () => {
    const results = [
      r({ url: 'https://a.com', title: 'Apple iPhone Review' }),
      r({ url: 'https://b.com', title: 'Samsung Galaxy Review' }),
    ];
    expect(dedupByTitle(results)).toHaveLength(2);
  });
});

describe('filterLowQuality', () => {
  it('keeps valid results', () => {
    const results = [r({ url: 'https://example.com/article' })];
    expect(filterLowQuality(results)).toHaveLength(1);
  });

  it('filters results with no snippet', () => {
    const results = [r({ url: 'https://example.com', snippet: '' })];
    expect(filterLowQuality(results)).toHaveLength(0);
  });

  it('filters results with very short snippet (< 20)', () => {
    const results = [r({ url: 'https://example.com', snippet: 'short' })];
    expect(filterLowQuality(results)).toHaveLength(0);
  });

  it('filters DDG ad URLs', () => {
    const results = [r({ url: 'https://example.com/y.js?some=1', snippet: 'enough length for sure' })];
    expect(filterLowQuality(results)).toHaveLength(0);
  });

  it('filters DDG ad redirects', () => {
    const results = [r({ url: 'https://duckduckgo.com/y.js?id=123', snippet: 'enough length for sure' })];
    expect(filterLowQuality(results)).toHaveLength(0);
  });

  it('filters non-http URLs', () => {
    const results = [r({ url: 'javascript:alert(1)', snippet: 'enough length for sure' })];
    expect(filterLowQuality(results)).toHaveLength(0);
  });

  it('filters Sogou internal links', () => {
    const results = [r({ url: 'https://www.sogou.com/link?url=abc', snippet: 'enough length for sure' })];
    expect(filterLowQuality(results)).toHaveLength(0);
  });

  it('filters Wikipedia category pages', () => {
    const results = [
      r({ url: 'https://en.wikipedia.org/wiki/Category:Animals', snippet: 'enough length for sure' }),
    ];
    expect(filterLowQuality(results)).toHaveLength(0);
  });
});
