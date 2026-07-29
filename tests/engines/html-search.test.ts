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
    'captcha - Search',
    'access denied - Search',
    'unusual traffic - Search',
  ])('does not classify a query-derived title %j as bot_challenge', async (title) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      `<html><head><title>${title}</title>
        <meta name="description" content="${title}">
      </head><body>
        <ol id="b_results"><li class="b_algo">
          <h2><a href="https://example.com/result">Normal result</a></h2>
          <p>Normal result content.</p>
        </li></ol>
      </body></html>`,
      200,
      'https://www.bing.com/search?q=captcha',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=captcha'))
      .resolves.toContain('Normal result');
  });

  it.each([
    'SmartCaptcha',
    'Security verification',
    'Unusual traffic',
  ])('preserves a title-only challenge marker %j', async (title) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      `<html><head><title>${title}</title></head><body></body></html>`,
      200,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({ failureType: 'bot_challenge' });
  });

  it.each([
    'Robot check',
    'Unusual traffic',
    'Security verification',
  ])('preserves a body-only challenge marker %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      `<html><body>${body}</body></html>`,
      200,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({ failureType: 'bot_challenge' });
  });

  it.each([
    'verify you are human',
    'please confirm that you are not a robot',
    'are you not a robot',
    'robot check',
  ])('does not classify a title-only query term %j as bot_challenge', async (marker) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      `<html><head><title>Search: ${marker}</title></head><body>
        <ol id="b_results"><li class="b_algo">
          <h2><a href="https://example.com/result">Normal result</a></h2>
        </li></ol>
      </body></html>`,
      200,
      'https://www.bing.com/search?q=robot',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=robot'))
      .resolves.toContain('Normal result');
  });

  it.each([
    'verify you are human',
    'please confirm that you are not a robot',
    'are you not a robot',
    'robot check',
  ])('does not classify a meta-only query term %j as bot_challenge', async (marker) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      `<html><head><title>Search results</title>
        <meta name="description" content="${marker}">
      </head><body>
        <ol id="b_results"><li class="b_algo">
          <h2><a href="https://example.com/result">Normal result</a></h2>
        </li></ol>
      </body></html>`,
      200,
      'https://www.bing.com/search?q=robot',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=robot'))
      .resolves.toContain('Normal result');
  });

  it('ignores challenge markers in scripts, styles, noscript, and ordinary result text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      `<html><head><title>OpenAI - Search</title>
        <style>.captcha { display: none }</style></head><body>
        <script>const captchaConfig = false;</script>
        <noscript>Please solve the captcha to continue.</noscript>
        <ol id="b_results"><li class="b_algo">
          <h2><a href="https://example.com/result">Normal result</a></h2>
          <p>This result explains captcha and access denied messages.</p>
        </li></ol>
      </body></html>`,
      200,
      'https://www.bing.com/search?q=OpenAI',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=OpenAI'))
      .resolves.toContain('Normal result');
  });

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
