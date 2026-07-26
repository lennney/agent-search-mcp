import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DuckDuckGoFallbackError,
  searchDuckDuckGoHtml,
  duckduckgoHtmlProvider,
} from '../../src/engines/duckduckgo-html.js';

describe('DuckDuckGo HTML engine', () => {
  it('has correct provider metadata', () => {
    expect(duckduckgoHtmlProvider.id).toBe('duckduckgo');
    expect(duckduckgoHtmlProvider.name).toBe('DuckDuckGo (HTML)');
    expect(duckduckgoHtmlProvider.isFree).toBe(true);
  });

  it('parses standard DDG HTML results', async () => {
    const html = `
      <div class="result results_links results_links_deep highlight_d">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/page1">Example Title 1</a>
        </h2>
        <a class="result__snippet" href="https://example.com/page1">Example snippet one</a>
        <span class="result__url">example.com</span>
      </div>
      <div class="result results_links results_links_deep">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/page2">Example Title 2</a>
        </h2>
        <a class="result__snippet" href="https://example.com/page2">Example snippet two</a>
        <span class="result__url">example.com</span>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Example Title 1');
      expect(results[0].url).toBe('https://example.com/page1');
      expect(results[0].snippet).toBe('Example snippet one');
      expect(results[0].source).toBe('duckduckgo');
      expect(results[0].engines).toEqual(['duckduckgo']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('respects the limit parameter', async () => {
    const html = Array.from({ length: 5 }, (_, i) => `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/${i}">Title ${i}</a>
        </h2>
        <a class="result__snippet" href="https://example.com/${i}">Snippet ${i}</a>
      </div>
    `).join('');

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 3);
      expect(results).toHaveLength(3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array when no results found', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => '<html><body>No results here</body></html>',
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    let fetchCount = 0;
    global.fetch = (async () => {
      fetchCount += 1;
      return {
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      };
    }) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
      expect(fetchCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on network error', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      throw new Error('Network error');
    }) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('strips HTML tags from titles and snippets', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com"><b>Bold</b> <i>Title</i></a>
        </h2>
        <a class="result__snippet" href="https://example.com">Snippet with <strong>tags</strong></a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Bold Title');
      expect(results[0].snippet).toBe('Snippet with tags');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('skips results without title or url', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="">Title without URL</a>
        </h2>
        <a class="result__snippet" href="">Snippet</a>
      </div>
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/has-url">Has URL</a>
        </h2>
        <a class="result__snippet" href="https://example.com/has-url">Valid snippet</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Has URL');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles DDG redirect URLs (uddg= parameter)', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Freal&rut=abc">Title</a>
        </h2>
        <a class="result__snippet" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Freal">Snippet</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/real');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles protocol-relative DDG redirect URLs (//duckduckgo.com/l/?uddg=...)', async () => {
    // DDG actually returns protocol-relative URLs in production HTML
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fmodelcontextprotocol%2Ftypescript-sdk&rut=abc">MCP TypeScript SDK</a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fmodelcontextprotocol%2Ftypescript-sdk">Official SDK</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://github.com/modelcontextprotocol/typescript-sdk');
      expect(results[0].title).toBe('MCP TypeScript SDK');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('filters out sponsored results (class="result--ad")', async () => {
    const html = `
      <div class="result results_links results_links_deep result--ad ">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fudemy.com%2Fcourse">Sponsored Course</a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fudemy.com%2Fcourse">Ad snippet</a>
      </div>
      <div class="result results_links results_links_deep">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fexample">Real Result</a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fexample">Real snippet</a>
      </div>
      <div class="result results_links results_links_deep result--ad result--ad--plain">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fanother-ad.com">Another Ad</a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fanother-ad.com">Ad 2</a>
      </div>
      <div class="result results_links results_links_deep">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freal-result.com%2Fpage">Second Real Result</a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freal-result.com%2Fpage">Real 2</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Real Result');
      expect(results[1].title).toBe('Second Real Result');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('falls back to DDG Lite on HTTP 202 and parses safe Lite results', async () => {
    const liteHtml = `
      <table>
        <tr>
          <td><a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Flite&rut=abc">Lite Result</a></td>
        </tr>
        <tr>
          <td class="result-snippet">Lite <strong>snippet</strong></td>
        </tr>
        <tr>
          <td><a class="result-link" href="javascript:alert(1)">Unsafe Result</a></td>
        </tr>
        <tr>
          <td><a class="result-link" href="https://example.com/second">Second Result</a></td>
        </tr>
        <tr>
          <td class="result-snippet">Second paired snippet</td>
        </tr>
      </table>
    `;
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const originalFetch = global.fetch;
    global.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      if (fetchCalls.length === 1) {
        return new Response('', { status: 202 });
      }
      return new Response(liteHtml, { status: 200 });
    }) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10, { throwOnError: true });
      expect(fetchCalls.map(call => String(call.input))).toEqual([
        'https://html.duckduckgo.com/html/',
        'https://lite.duckduckgo.com/lite/',
      ]);
      expect(results).toEqual([
        {
          title: 'Lite Result',
          url: 'https://example.com/lite',
          snippet: 'Lite snippet',
          source: 'duckduckgo',
          engines: ['duckduckgo'],
        },
        {
          title: 'Second Result',
          url: 'https://example.com/second',
          snippet: 'Second paired snippet',
          source: 'duckduckgo',
          engines: ['duckduckgo'],
        },
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('filters sponsored rows from DDG Lite even when they use valid external URLs', async () => {
    const liteHtml = `
      <table>
        <tr class="result-sponsored">
          <td><a class="result-link" href="https://ads.example/course">Sponsored Course</a></td>
        </tr>
        <tr class="result-sponsored">
          <td class="result-snippet">Sponsored snippet</td>
        </tr>
        <tr>
          <td><a class="result-link" href="https://example.com/organic">Organic Result</a></td>
        </tr>
        <tr>
          <td class="result-snippet">Organic paired snippet</td>
        </tr>
      </table>
    `;
    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      fetchCount += 1;
      return fetchCount === 1
        ? new Response('', { status: 202 })
        : new Response(liteHtml, { status: 200 });
    }) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10, {
        throwOnError: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Organic Result');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('treats DOM-equivalent Lite captcha markup as a fallback failure', async () => {
    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      fetchCount += 1;
      return fetchCount === 1
        ? new Response('', { status: 202 })
        : new Response("<html><form class='gate' id = 'challenge-form'></form></html>", {
            status: 200,
          });
    }) as typeof fetch;

    try {
      await expect(searchDuckDuckGoHtml('test query', 10, {
        throwOnError: true,
      })).rejects.toThrow(
        'DuckDuckGo fallback failed: HTML HTTP 202 rate limit; Lite: DuckDuckGo Lite captcha challenge',
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports a Lite HTTP 202 as the second same-provider failure', async () => {
    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      fetchCount += 1;
      return new Response('', { status: 202 });
    }) as typeof fetch;

    try {
      await expect(searchDuckDuckGoHtml('test query', 10, {
        throwOnError: true,
      })).rejects.toThrow(
        'DuckDuckGo fallback failed: HTML HTTP 202 rate limit; Lite: DuckDuckGo Lite HTTP 202 rate limit',
      );
      expect(fetchCount).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('throws only after the DDG Lite fallback also fails', async () => {
    const fetchCalls: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = (async (input) => {
      fetchCalls.push(String(input));
      if (fetchCalls.length === 1) {
        return new Response('', { status: 202 });
      }
      return new Response('Service Unavailable', { status: 503 });
    }) as typeof fetch;

    try {
      await expect(searchDuckDuckGoHtml('test query', 10, { throwOnError: true }))
        .rejects.toMatchObject({
          name: 'DuckDuckGoFallbackError',
          message: 'DuckDuckGo fallback failed: HTML HTTP 202 rate limit; Lite: DuckDuckGo Lite HTTP 503',
          retryable: false,
          failureType: 'bot_challenge',
          cooldownMs: 3_600_000,
        } satisfies Partial<DuckDuckGoFallbackError>);
      expect(fetchCalls).toEqual([
        'https://html.duckduckgo.com/html/',
        'https://lite.duckduckgo.com/lite/',
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns an empty array when the DDG Lite fallback fails in soft-error mode', async () => {
    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response('', { status: 202 });
      }
      throw new Error('Lite network error');
    }) as typeof fetch;

    try {
      await expect(searchDuckDuckGoHtml('test query', 10)).resolves.toEqual([]);
      expect(fetchCount).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not start the Lite attempt when the caller cancels after HTML 202', async () => {
    const controller = new AbortController();
    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      fetchCount += 1;
      controller.abort(new DOMException('cancelled', 'AbortError'));
      return new Response('', { status: 202 });
    }) as typeof fetch;

    try {
      await expect(searchDuckDuckGoHtml('test query', 10, {
        signal: controller.signal,
        throwOnError: true,
      })).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on captcha challenge page', async () => {
    const html = `<html><body><form id="challenge-form"><input type="text" /></form></body></html>`;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects DDG-internal ad URLs (duckduckgo.com/y.js)', async () => {
    const html = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=udemy.com&ad_provider=bing">Ad via y.js</a>
        </h2>
        <a class="result__snippet" href="https://duckduckgo.com/y.js?ad_domain=udemy.com">Ad snippet</a>
      </div>
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/real">Real Result</a>
        </h2>
        <a class="result__snippet" href="https://example.com/real">Real snippet</a>
      </div>
    `;

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      text: async () => html,
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Real Result');
      expect(results[0].url).toBe('https://example.com/real');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses POST method with form-encoded body', async () => {
    const html = '<html><body>No results</body></html>';
    let fetchCallArgs: any = null;

    const originalFetch = global.fetch;
    global.fetch = (async (input: any, init: any) => {
      fetchCallArgs = { input, init };
      return { ok: true, text: async () => html } as Response;
    }) as typeof fetch;

    try {
      await searchDuckDuckGoHtml('test query', 10);
      expect(fetchCallArgs.init.method).toBe('POST');
      expect(fetchCallArgs.init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(fetchCallArgs.init.body).toContain('q=test+query');
      expect(fetchCallArgs.init.headers['Referer']).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
