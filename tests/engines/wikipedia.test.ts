import { describe, it, expect } from 'vitest';
import { searchWikipedia, wikipediaProvider } from '../../src/engines/wikipedia.js';
import { scoreAndRank } from '../../src/aggregation/scorer.js';

describe('Wikipedia engine', () => {
  it('has correct provider metadata', () => {
    expect(wikipediaProvider.id).toBe('wikipedia');
    expect(wikipediaProvider.name).toBe('Wikipedia');
    expect(wikipediaProvider.isFree).toBe(true);
    expect(wikipediaProvider.languages).toContain('en');
    expect(wikipediaProvider.languages).toContain('zh');
  });

  it('searchWikipedia returns results with article extracts', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          query: {
            pages: [{
              title: 'Test Title',
              extract: 'Test snippet with enough detail for ranking.',
              fullurl: 'https://en.wikipedia.org/wiki/Test',
            }],
          },
        }),
      }) as unknown as typeof fetch;

      const results = await searchWikipedia('test', 5);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Test Title');
      expect(results[0].url).toBe('https://en.wikipedia.org/wiki/Test');
      expect(results[0].snippet).toBe('Test snippet with enough detail for ranking.');
      expect(results[0].source).toBe('wikipedia');
      expect(results[0].engines).toEqual(['wikipedia']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('preserves the matched search passage for downstream relevance ranking', async () => {
    const originalFetch = global.fetch;
    let requestedUrl = '';
    try {
      global.fetch = async (input) => {
        requestedUrl = String(input);
        return {
          ok: true,
          json: async () => ({
            query: {
              pages: [
                {
                  index: 1,
                  title: 'HMAC',
                  extract: 'HMAC is a keyed-hash message authentication code.',
                  snippet: 'A keyed-hash message authentication code.',
                  fullurl: 'https://en.wikipedia.org/wiki/HMAC',
                },
                {
                  index: 2,
                  title: 'OAuth',
                  extract: 'OAuth is an open standard for access delegation.',
                  snippet: '<span class="searchmatch">Proof Key for Code Exchange</span> is an OAuth extension.',
                  fullurl: 'https://en.wikipedia.org/wiki/OAuth',
                },
              ],
            },
          }),
        } as unknown as Response;
      };

      const query = 'Proof Key for Code Exchange';
      const results = await searchWikipedia(query, 3);
      const ranked = scoreAndRank(results, query, { wikipedia: 0.93 });

      expect(new URL(requestedUrl).searchParams.get('gsrprop')).toBe('snippet');
      expect(results.find(result => result.title === 'OAuth')?.snippet)
        .toContain('Proof Key for Code Exchange');
      expect(ranked[0].title).toBe('OAuth');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses Chinese Wikipedia for a Chinese query', async () => {
    const originalFetch = global.fetch;
    let requestedUrl = '';
    let requestHeaders = new Headers();
    try {
      global.fetch = async (input, init) => {
        requestedUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        return {
          ok: true,
          json: async () => ({ query: { pages: [] } }),
        } as unknown as Response;
      };

      await searchWikipedia('人工智能', 5);

      expect(requestedUrl).toMatch(/^https:\/\/zh\.wikipedia\.org\//);
      expect(requestHeaders.get('user-agent')).toContain('agent-search-mcp');
      expect(requestHeaders.get('api-user-agent')).toContain(
        'github.com/lennney/agent-search-mcp',
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('preserves HTTP 429 as a rate-limit suspension in strict mode', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response('', { status: 429 });

      await expect(searchWikipedia('test', 5, {
        throwOnError: true,
      })).rejects.toMatchObject({
        failureType: 'rate_limited',
        retryable: false,
        cooldownMs: 60_000,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchWikipedia returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch;

      const results = await searchWikipedia('test');
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchWikipedia returns empty array on network error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchWikipedia('test');
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
