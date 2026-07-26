import { describe, it, expect, vi } from 'vitest';
import { searchBing, searchBingNews, bingProvider } from '../../src/engines/bing.js';

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

  it('filters Bing News results to the requested time range', async () => {
    const originalFetch = global.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
    try {
      global.fetch = async () => new Response(`
        <rss><channel>
          <item>
            <title>Recent story</title>
            <link>https://example.com/recent</link>
            <description>Published six hours ago</description>
            <pubDate>Sun, 26 Jul 2026 06:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Older story</title>
            <link>https://example.com/older</link>
            <description>Published three days ago</description>
            <pubDate>Thu, 23 Jul 2026 12:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `, { status: 200 });

      const results = await searchBingNews('release', 10, { timeRange: 'day' });

      expect(results.map(result => result.url)).toEqual(['https://example.com/recent']);
    } finally {
      global.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it('propagates caller cancellation through Bing News HTTP', async () => {
    const originalFetch = global.fetch;
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    try {
      global.fetch = async (_input, init) => {
        requestSignal = init?.signal ?? undefined;
        controller.abort(new DOMException('cancelled by caller', 'AbortError'));
        throw new Error('fetch stopped');
      };

      await expect(searchBingNews('release', 10, {
        timeRange: 'week',
        signal: controller.signal,
      })).rejects.toMatchObject({
        name: 'AbortError',
        message: 'cancelled by caller',
      });
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
