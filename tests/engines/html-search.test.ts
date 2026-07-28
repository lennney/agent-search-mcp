import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSearchHtml } from '../../src/engines/html-search.js';

function mockResponse(
  body: string,
  status: number,
  url: string,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers(headers),
    text: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shared HTML search transport', () => {
  it.each([
    [200, '<html><head><title>Verify you are human</title></head></html>'],
    [403, '<html><body>Access denied: verify you are human</body></html>'],
    [429, '<html><body>Too many requests. Please solve the captcha.</body></html>'],
  ])('classifies a body-only challenge for HTTP %s as bot_challenge', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      body,
      status,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({
        failureType: 'bot_challenge',
        retryable: false,
        cooldownMs: 3_600_000,
      });
  });

  it.each([
    200,
    403,
    429,
  ])('classifies a URL-only challenge for HTTP %s as bot_challenge', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      '<html><body>ordinary provider response</body></html>',
      status,
      'https://www.bing.com/captcha/verify?return=search',
      status === 429 ? { 'retry-after': '9' } : {},
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({
        failureType: 'bot_challenge',
        retryable: false,
        cooldownMs: 3_600_000,
      });
  });

  it('keeps an ordinary 403 as an upstream HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      '<html><body>Forbidden</body></html>',
      403,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({
        failureType: 'upstream_4xx',
        retryable: false,
      });
  });

  it('keeps an ordinary 429 as a rate-limit failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      '<html><body>Too many requests</body></html>',
      429,
      'https://www.bing.com/search?q=test',
      { 'retry-after': '7' },
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({
        failureType: 'rate_limited',
        retryable: false,
        cooldownMs: 7_000,
      });
  });
});
