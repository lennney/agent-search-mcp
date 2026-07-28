import { describe, it, expect } from 'vitest';
import {
  bingProvider,
  parseBingHTML,
  searchBing,
} from '../../src/engines/bing.js';

describe('Bing engine', () => {
  it('has correct provider metadata', () => {
    expect(bingProvider.id).toBe('bing');
    expect(bingProvider.name).toBe('Bing');
    expect(bingProvider.isFree).toBe(true);
    expect(bingProvider.languages).toContain('en');
    expect(bingProvider.languages).toContain('zh');
  });

  it('searchBing returns array', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () => '<html><body>test</body></html>',
      }) as Response;

      const results = await searchBing('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBing returns empty array on fetch error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchBing('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBing returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchBing('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('parses result cards through the public HTML parser', () => {
    const results = parseBingHTML(`
      <html><head><title>Bing</title></head><body>
        <ol id="b_results">
          <li class="b_algo">
            <h2><a href="https://example.com/bing">Bing result</a></h2>
            <div class="b_caption"><p>A &amp; useful snippet.</p></div>
          </li>
        </ol>
      </body></html>
    `, 5);

    expect(results).toEqual([{
      title: 'Bing result',
      url: 'https://example.com/bing',
      snippet: 'A & useful snippet.',
      source: 'bing',
      engines: ['bing'],
    }]);
  });

  it('reports an unexpected 200 HTML shape instead of a successful empty result', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>Bing</title></head><body>changed</body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBing('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'parse_error',
          retryable: false,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps a valid zero-result search page as an empty success', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>Bing</title></head><body><ol id="b_results"></ol></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBing('no matching result', 5, { throwOnError: true }))
        .resolves.toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('classifies a 200 anti-bot interstitial as a bounded challenge', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>Bing - Verify you are human</title></head><body>captcha</body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBing('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'bot_challenge',
          retryable: false,
          cooldownMs: 3_600_000,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
