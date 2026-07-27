import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchBocha } from '../../src/engines/bocha.js';

afterEach(() => {
  delete process.env.BOCHA_API_KEY;
  vi.unstubAllGlobals();
});

describe('searchBocha', () => {
  it('does not make a request without a configured credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchBocha('query', 3)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests compact web results and parses valid entries', async () => {
    process.env.BOCHA_API_KEY = 'bocha-secret';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      webPages: {
        value: [
          {
            name: '博查结果',
            url: 'https://example.cn/bocha',
            snippet: '搜索摘要',
            summary: 'Long generated summary that should not be preferred',
            datePublished: '2026-07-26T00:00:00+08:00',
          },
          { name: 'Unsafe URL', url: 'javascript:alert(1)' },
        ],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchBocha('中文查询', 8, {
      throwOnError: true,
    })).resolves.toEqual([{
      title: '博查结果',
      url: 'https://example.cn/bocha',
      snippet: '搜索摘要',
      source: 'bocha',
      engines: ['bocha'],
      published_at: '2026-07-26T00:00:00+08:00',
    }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.bochaai.com/v1/web-search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer bocha-secret',
        }),
        body: JSON.stringify({
          query: '中文查询',
          freshness: 'noLimit',
          summary: false,
          count: 8,
        }),
      }),
    );
  });

  it('classifies application-level rate limits', async () => {
    process.env.BOCHA_API_KEY = 'bocha-secret';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 429,
      message: 'too many requests',
    }), { status: 200 })));

    await expect(searchBocha('query', 3, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'rate_limited',
      retryable: false,
      cooldownMs: 30_000,
    });
  });
});
