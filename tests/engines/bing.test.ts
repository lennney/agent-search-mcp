import { describe, it, expect } from 'vitest';
import { searchBing, bingProvider } from '../../src/engines/bing.js';

describe('Bing engine', () => {
  it('has correct provider metadata', () => {
    expect(bingProvider.id).toBe('bing');
    expect(bingProvider.name).toBe('Bing');
    expect(bingProvider.isFree).toBe(true);
    expect(bingProvider.languages).toContain('en');
    expect(bingProvider.languages).toContain('zh');
  });

  it('searchBing returns array', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () => '<html><body>test</body></html>',
      }) as Response;

      const results = await searchBing('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBing returns empty array on fetch error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchBing('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBing returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchBing('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
