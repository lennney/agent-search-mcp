import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchTencentWsa } from '../../src/engines/tencent-wsa.js';

afterEach(() => {
  delete process.env.TENCENT_WSA_API_KEY;
  vi.unstubAllGlobals();
});

describe('searchTencentWsa', () => {
  it('does not make a request without a configured credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchTencentWsa('query', 3)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses Pages JSON strings and ignores malformed entries', async () => {
    process.env.TENCENT_WSA_API_KEY = 'wsa-secret';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      Response: {
        Pages: [
          JSON.stringify({
            title: '腾讯结果',
            url: 'https://example.com/tencent',
            passage: '紧凑摘要',
            date: '2026-07-26',
          }),
          '{bad json',
          JSON.stringify({ title: 'Missing URL' }),
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchTencentWsa('中文查询', 5, {
      throwOnError: true,
    })).resolves.toEqual([{
      title: '腾讯结果',
      url: 'https://example.com/tencent',
      snippet: '紧凑摘要',
      source: 'tencent_wsa',
      engines: ['tencent_wsa'],
      published_at: '2026-07-26',
    }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.wsa.cloud.tencent.com/SearchPro',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer wsa-secret',
        }),
        body: JSON.stringify({ Query: '中文查询', Mode: 0 }),
      }),
    );
  });

  it('classifies service errors without exposing the credential', async () => {
    process.env.TENCENT_WSA_API_KEY = 'never-log-this';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      Response: {
        Error: {
          Code: 'UnauthorizedOperation',
          Message: 'credential never-log-this rejected',
        },
      },
    }), { status: 200 })));

    const promise = searchTencentWsa('query', 3, { throwOnError: true });
    await expect(promise).rejects.toMatchObject({
      failureType: 'permission_denied',
      retryable: false,
    });
    await expect(promise).rejects.not.toThrow('never-log-this');
  });

  it('honors Retry-After without immediate retry semantics', async () => {
    process.env.TENCENT_WSA_API_KEY = 'wsa-secret';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 429,
      headers: { 'Retry-After': '60' },
    })));

    await expect(searchTencentWsa('query', 3, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'rate_limited',
      retryable: false,
      cooldownMs: 60_000,
    });
  });
});
