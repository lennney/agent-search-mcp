import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchDuckDuckGoHtml, duckduckgoHtmlProvider } from '../../src/engines/duckduckgo-html.js';

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
    global.fetch = (async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
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

  it('returns empty array on rate limit (HTTP 202)', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: false,
      status: 202,
      text: async () => '',
    })) as typeof fetch;

    try {
      const results = await searchDuckDuckGoHtml('test query', 10);
      expect(results).toEqual([]);
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
