import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchDuckDuckGoWeb } from '../../src/engines/duckduckgo-web.js';

const HOME_URL = 'https://duckduckgo.com/?q=test+query&t=h_&ia=web';
const PRELOAD_URL = 'https://links.duckduckgo.com/d.js?q=test%20query&s=0&vqd=token&dp=proof';

describe('DuckDuckGo Web representation', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses the signed preload URL with one stable browser identity', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (input, init) => {
      calls.push({ input: String(input), init });
      if (calls.length === 1) {
        return new Response(
          `<html><head><link id="deep_preload_link" rel="preload" as="script" href="${PRELOAD_URL}"></head></html>`,
          { status: 200 },
        );
      }
      return Response.json({
        results: [
          {
            t: '<b>Useful</b> result',
            u: 'https://example.com/page',
            a: 'A <strong>useful</strong> snippet',
          },
          {
            t: 'Internal ad',
            u: 'https://duckduckgo.com/y.js?ad_domain=example.com',
            a: 'ad',
          },
          { n: '/d.js?q=test&next=1' },
        ],
      });
    }) as typeof fetch;

    const results = await searchDuckDuckGoWeb('test query', 10, {
      throwOnError: true,
    });

    expect(results).toEqual([{
      title: 'Useful result',
      url: 'https://example.com/page',
      snippet: 'A useful snippet',
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    }]);
    expect(calls).toHaveLength(2);
    expect(calls[0].input).toBe(HOME_URL);
    expect(calls[1].input).toMatch(
      /^https:\/\/links\.duckduckgo\.com\/d\.js\?o=json&/,
    );
    expect(calls[1].input).toContain('vqd=token');

    const firstHeaders = new Headers(calls[0].init?.headers);
    const secondHeaders = new Headers(calls[1].init?.headers);
    expect(firstHeaders.get('user-agent')).toBe(secondHeaders.get('user-agent'));
    expect(secondHeaders.get('sec-fetch-dest')).toBe('script');
    expect(secondHeaders.get('referer')).toBe('https://duckduckgo.com/');
  });

  it('rejects a preload URL outside the exact DDG API boundary', async () => {
    global.fetch = vi.fn(async () => new Response(
      '<link id="deep_preload_link" href="https://attacker.example/d.js?q=test">',
      { status: 200 },
    )) as typeof fetch;

    await expect(searchDuckDuckGoWeb('test query', 10, {
      throwOnError: true,
    })).rejects.toThrow('untrusted preload URL');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not start the API request after caller cancellation', async () => {
    const controller = new AbortController();
    global.fetch = vi.fn(async () => {
      controller.abort(new DOMException('cancelled', 'AbortError'));
      return new Response(
        `<link id="deep_preload_link" href="${PRELOAD_URL}">`,
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(searchDuckDuckGoWeb('test query', 10, {
      signal: controller.signal,
      throwOnError: true,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves challenge failures in strict mode and soft-fails otherwise', async () => {
    global.fetch = vi.fn(async () => new Response(
      '<html>anomaly challenge</html>',
      { status: 202 },
    )) as typeof fetch;

    await expect(searchDuckDuckGoWeb('test query', 10, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'bot_challenge',
      retryable: false,
    });
    await expect(searchDuckDuckGoWeb('test query', 10)).resolves.toEqual([]);
  });

  it('classifies malformed provider payloads separately from network failures', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(
        `<link id="deep_preload_link" href="${PRELOAD_URL}">`,
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response('{not-json', { status: 200 })) as typeof fetch;

    await expect(searchDuckDuckGoWeb('test query', 10, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'parse_error',
      retryable: false,
    });
  });
});
