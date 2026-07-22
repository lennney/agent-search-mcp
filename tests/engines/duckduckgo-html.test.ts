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
});
