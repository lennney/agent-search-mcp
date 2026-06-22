import { describe, it, expect } from 'vitest';
import { searchBaidu, baiduProvider } from '../../src/engines/baidu.js';

describe('Baidu engine', () => {
  it('has correct provider metadata', () => {
    expect(baiduProvider.id).toBe('baidu');
    expect(baiduProvider.name).toBe('Baidu');
    expect(baiduProvider.isFree).toBe(true);
    expect(baiduProvider.languages).toContain('zh');
  });

  it('searchBaidu returns array', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () => '<html><body>test</body></html>',
      }) as Response;

      const results = await searchBaidu('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBaidu returns empty array on fetch error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchBaidu('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBaidu returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchBaidu('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
