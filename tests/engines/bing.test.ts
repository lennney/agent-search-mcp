import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bingProvider,
  parseBingHTML,
  searchBing,
} from '../../src/engines/bing.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Bing engine', () => {
  it('has correct provider metadata', () => {
    expect(bingProvider.id).toBe('bing');
    expect(bingProvider.name).toBe('Bing');
    expect(bingProvider.isFree).toBe(true);
    expect(bingProvider.languages).toEqual(expect.arrayContaining(['en', 'zh']));
  });

  it('parses DOM result cards and normalizes provider text', () => {
    const results = parseBingHTML(`
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://example.com/bing">Bing &amp; result</a></h2>
          <div class="b_caption"><p>A   useful &amp; compact snippet.</p></div>
        </li>
        <li class="b_algo">
          <h2><a href="https://www.bing.com/internal">Internal</a></h2>
          <p>Not a result.</p>
        </li>
      </ol>
    `, 5);

    expect(results).toEqual([{
      title: 'Bing & result',
      url: 'https://example.com/bing',
      snippet: 'A useful & compact snippet.',
      source: 'bing',
      engines: ['bing'],
    }]);
  });

  it('keeps a recognized empty search surface as an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><body><ol id="b_results"></ol></body></html>',
      { status: 200 },
    )));

    await expect(searchBing('no matching result', 5, { throwOnError: true }))
      .resolves.toEqual([]);
  });

  it('reports changed successful HTML instead of a successful empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><head><title>Bing</title></head><body>changed</body></html>',
      { status: 200 },
    )));

    await expect(searchBing('test query', 5, { throwOnError: true }))
      .rejects.toMatchObject({
        failureType: 'parse_error',
        retryable: false,
      });
  });

  it('reports result-card parser drift as parse_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <html><body><ol id="b_results">
        <li class="b_algo"><div class="changed-title">No known link</div></li>
      </ol></body></html>
    `, { status: 200 })));

    await expect(searchBing('test query', 5, { throwOnError: true }))
      .rejects.toMatchObject({ failureType: 'parse_error' });
  });

  it('soft-fails typed adapter errors for direct callers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><head><title>Verify you are human</title></head><body>captcha</body></html>',
      { status: 200 },
    )));

    await expect(searchBing('test query', 5)).resolves.toEqual([]);
  });
});
