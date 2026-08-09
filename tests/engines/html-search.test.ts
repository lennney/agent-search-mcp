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
});

describe('shared HTML search module', () => {
  it('returns a recognized page and reports whether result cards exist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(`
      <html><head><title>captcha - Search</title></head><body>
        <ol id="b_results"><li class="b_algo">
          <h2><a href="https://example.com/result">Normal result</a></h2>
          <p>This result explains captcha messages.</p>
        </li></ol>
      </body></html>
    `, 200, 'https://www.bing.com/search?q=captcha')));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=captcha'))
      .resolves.toMatchObject({ hasResultCards: true });
  });

  it.each([
    '<html><head><title>Verify you are human</title></head><body></body></html>',
    '<html><body>Robot check</body></html>',
    '<html><body>Security verification</body></html>',
  ])('classifies a successful challenge page as bot_challenge', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      body,
      200,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({
        failureType: 'bot_challenge',
        retryable: false,
        cooldownMs: 3_600_000,
      });
  });

  it('classifies a verification redirect URL before generic HTTP handling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      '<html><body>ordinary provider response</body></html>',
      403,
      'https://yandex.com/showcaptchafast?retpath=search',
    )));

    await expect(fetchSearchHtml('yandex', 'https://yandex.com/search/?text=test'))
      .rejects.toMatchObject({ failureType: 'bot_challenge' });
  });

  it('does not classify query text or hidden script text as a challenge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(`
      <html><head><title>verify you are human - Search</title></head><body>
        <script>const captcha = true;</script>
        <noscript>Please solve the captcha.</noscript>
        <ol id="b_results"><li class="b_algo">
          <h2><a href="https://example.com/result">Normal result</a></h2>
        </li></ol>
      </body></html>
    `, 200, 'https://www.bing.com/search?q=verify+you+are+human')));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=verify'))
      .resolves.toMatchObject({ hasResultCards: true });
  });

  it('keeps an ordinary 429 as rate_limited and honors Retry-After', async () => {
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

  it.each([
    [403, 'upstream_4xx', false],
    [503, 'upstream_5xx', true],
  ])('classifies ordinary HTTP %s', async (status, failureType, retryable) => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      '<html><body>Provider error</body></html>',
      status,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({ failureType, retryable });
  });

  it('classifies an internal timeout without rewriting caller cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({ failureType: 'timeout', retryable: true });

    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    controller.abort(reason);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test', {
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports unrecognized successful HTML as parse_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse(
      '<html><head><title>Search</title></head><body>changed layout</body></html>',
      200,
      'https://www.bing.com/search?q=test',
    )));

    await expect(fetchSearchHtml('bing', 'https://www.bing.com/search?q=test'))
      .rejects.toMatchObject({ failureType: 'parse_error', retryable: false });
  });
});
