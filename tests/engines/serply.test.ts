import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchSerply } from '../../src/engines/serply.js';

afterEach(() => {
  delete process.env.SERPLY_API_KEY;
  vi.unstubAllGlobals();
});

describe('searchSerply', () => {
  it('does not make a request without a configured credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSerply('query', 3)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses results through the fixed Google endpoint', async () => {
    process.env.SERPLY_API_KEY = 'serply-secret';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          title: 'Google result',
          link: 'https://example.com/serply',
          description: 'Result snippet',
        },
        { title: '', link: 'https://example.com/invalid' },
        { title: 'Not a web URL', link: 'javascript:alert(1)' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSerply('agent search', 4, {
      throwOnError: true,
    })).resolves.toEqual([{
      title: 'Google result',
      url: 'https://example.com/serply',
      snippet: 'Result snippet',
      source: 'serply',
      engines: ['serply'],
    }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.serply.io/v1/search?q=agent+search&num=4',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'User-Agent': 'agent-search-mcp',
          'X-Api-Key': 'serply-secret',
        }),
      }),
    );
  });

  it('caps the request at one results page and trims the response', async () => {
    process.env.SERPLY_API_KEY = 'serply-secret';
    const results = Array.from({ length: 12 }, (_, index) => ({
      title: `Result ${index}`,
      link: `https://example.com/${index}`,
      description: '',
    }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSerply('query', 50)).resolves.toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.serply.io/v1/search?q=query&num=10',
      expect.anything(),
    );
  });

  it('treats an error detail as a rejected request', async () => {
    process.env.SERPLY_API_KEY = 'serply-secret';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      detail: 'Invalid API key',
    }), { status: 200 })));

    await expect(searchSerply('query', 3, { throwOnError: true }))
      .rejects.toMatchObject({ failureType: 'upstream_4xx', retryable: false });
  });

  it('marks upstream server errors retryable without leaking the key', async () => {
    process.env.SERPLY_API_KEY = 'never-log-this';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 503,
    })));

    const promise = searchSerply('query', 3, { throwOnError: true });
    await expect(promise).rejects.toMatchObject({
      failureType: 'upstream_5xx',
      retryable: true,
    });
    await expect(promise).rejects.not.toThrow('never-log-this');
  });
});
