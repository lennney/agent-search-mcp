import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchSerper } from '../../src/engines/serper.js';

afterEach(() => {
  delete process.env.SERPER_API_KEY;
  vi.unstubAllGlobals();
});

describe('searchSerper', () => {
  it('does not make a request without a configured credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSerper('query', 3)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses organic results through the fixed Google endpoint', async () => {
    process.env.SERPER_API_KEY = 'serper-secret';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      organic: [
        {
          title: 'Google result',
          link: 'https://example.com/serper',
          snippet: 'Result snippet',
          date: 'Jul 26, 2026',
        },
        { title: '', link: 'https://example.com/invalid' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSerper('agent search', 4, {
      throwOnError: true,
    })).resolves.toEqual([{
      title: 'Google result',
      url: 'https://example.com/serper',
      snippet: 'Result snippet',
      source: 'serper',
      engines: ['serper'],
      published_at: 'Jul 26, 2026',
    }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://google.serper.dev/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-KEY': 'serper-secret',
        }),
        body: JSON.stringify({ q: 'agent search', num: 4 }),
      }),
    );
  });

  it('marks upstream server errors retryable without leaking the key', async () => {
    process.env.SERPER_API_KEY = 'never-log-this';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 503,
    })));

    const promise = searchSerper('query', 3, { throwOnError: true });
    await expect(promise).rejects.toMatchObject({
      failureType: 'upstream_5xx',
      retryable: true,
    });
    await expect(promise).rejects.not.toThrow('never-log-this');
  });
});
