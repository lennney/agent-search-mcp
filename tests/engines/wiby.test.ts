import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchWiby } from '../../src/engines/wiby.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchWiby', () => {
  it('parses the official JSON shape and includes required attribution', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        Title: 'Independent page',
        URL: 'https://example.net/page',
        Snippet: 'Small-Web result.',
      },
      {
        Title: 'Unsafe result',
        URL: 'javascript:alert(1)',
        Snippet: 'Ignored',
      },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchWiby('independent web', 5, {
      throwOnError: true,
    })).resolves.toEqual([{
      title: 'Independent page',
      url: 'https://example.net/page',
      snippet: 'Small-Web result. Search index: https://wiby.me/',
      source: 'wiby.me',
      engines: ['wiby'],
    }]);
    const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.origin).toBe('https://wiby.me');
    expect(requestedUrl.pathname).toBe('/json/');
    expect(requestedUrl.searchParams.get('q')).toBe('independent web');
  });

  it('decodes HTML entities in provider-owned text fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      {
        Title: 'Alice&#39;s &amp; Bob&#39;s page',
        URL: 'https://example.net/entities',
        Snippet: 'A &quot;small web&quot; result.',
      },
    ]), { status: 200 })));

    const results = await searchWiby('html entities', 1, {
      throwOnError: true,
    });

    expect(results[0]).toMatchObject({
      title: "Alice's & Bob's page",
      snippet: 'A "small web" result. Search index: https://wiby.me/',
    });
  });

  it('does not automatically retry shared public-server failures', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchWiby('query', 3, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'upstream_5xx',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty fallback response for malformed JSON by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad json', {
      status: 200,
    })));

    await expect(searchWiby('query', 3)).resolves.toEqual([]);
  });
});
