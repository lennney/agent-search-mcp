import { describe, it, expect } from 'vitest';
import { searchWikipedia, wikipediaProvider } from '../../src/engines/wikipedia.js';

describe('Wikipedia engine', () => {
  it('has correct provider metadata', () => {
    expect(wikipediaProvider.id).toBe('wikipedia');
    expect(wikipediaProvider.name).toBe('Wikipedia');
    expect(wikipediaProvider.isFree).toBe(true);
    expect(wikipediaProvider.languages).toContain('en');
    expect(wikipediaProvider.languages).toContain('zh');
  });

  it('searchWikipedia returns results from opensearch API', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        json: async () => [
          'test',
          ['Test Title'],
          ['Test snippet'],
          ['https://en.wikipedia.org/wiki/Test'],
        ],
      }) as unknown as typeof fetch;

      const results = await searchWikipedia('test', 5);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Test Title');
      expect(results[0].url).toBe('https://en.wikipedia.org/wiki/Test');
      expect(results[0].source).toBe('wikipedia');
      expect(results[0].engines).toEqual(['wikipedia']);
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