import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerFreeSearchNews } from '../../src/tools/free-search-news.js';

interface NewsToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

type NewsToolHandler = (
  input: {
    query: string;
    count: number;
    time_range: 'day' | 'week' | 'month';
  },
  extra?: { signal?: AbortSignal },
) => Promise<NewsToolResponse>;

function captureHandler(): NewsToolHandler {
  let handler: NewsToolHandler | undefined;
  const server = {
    registerTool: (
      _name: string,
      _config: unknown,
      callback: NewsToolHandler,
    ) => {
      handler = callback;
    },
  } as unknown as McpServer;
  registerFreeSearchNews(server);
  if (!handler) throw new Error('free_search_news handler was not registered');
  return handler;
}

describe('free_search_news tool', () => {
  it('uses the real news feed and enforces the requested time range', async () => {
    const originalFetch = global.fetch;
    const originalDdgProxy = process.env.DUCKDUCKGO_PROXY_URL;
    const originalUseProxy = process.env.USE_PROXY;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
    delete process.env.DUCKDUCKGO_PROXY_URL;
    process.env.USE_PROXY = 'false';
    const fetchMock = vi.fn(async () => new Response(`
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
    `, { status: 200 }));
    global.fetch = fetchMock;

    try {
      const response = await captureHandler()({
        query: 'release',
        count: 10,
        time_range: 'day',
      });
      const payload = JSON.parse(response.content[0].text);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0][0])).toContain('bing.com/news/search');
      expect(payload.results.map((result: { url: string }) => result.url))
        .toEqual(['https://example.com/recent']);
    } finally {
      global.fetch = originalFetch;
      if (originalDdgProxy === undefined) {
        delete process.env.DUCKDUCKGO_PROXY_URL;
      } else {
        process.env.DUCKDUCKGO_PROXY_URL = originalDdgProxy;
      }
      if (originalUseProxy === undefined) {
        delete process.env.USE_PROXY;
      } else {
        process.env.USE_PROXY = originalUseProxy;
      }
      vi.useRealTimers();
    }
  });

  it('propagates MCP cancellation instead of returning an empty success', async () => {
    const originalFetch = global.fetch;
    const controller = new AbortController();
    try {
      global.fetch = async () => {
        controller.abort(new DOMException('cancelled by MCP client', 'AbortError'));
        throw new Error('fetch stopped');
      };

      await expect(captureHandler()({
        query: 'release',
        count: 10,
        time_range: 'week',
      }, {
        signal: controller.signal,
      })).rejects.toMatchObject({
        name: 'AbortError',
        message: 'cancelled by MCP client',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports an upstream news failure instead of hiding it as zero results', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response('unavailable', { status: 503 });

      const response = await captureHandler()({
        query: 'release',
        count: 10,
        time_range: 'week',
      });
      const payload = JSON.parse(response.content[0].text);

      expect(payload.results).toEqual([]);
      expect(payload.partialFailures).toEqual([
        expect.objectContaining({
          engine: 'bing',
          type: 'upstream_5xx',
          message: 'Bing News HTTP 503',
        }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
