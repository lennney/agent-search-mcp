import { describe, it, expect } from 'vitest';
import { searchBaidu, baiduProvider, parseBaiduHTML } from '../../src/engines/baidu.js';

describe('Baidu engine', () => {
  it('has correct provider metadata', () => {
    expect(baiduProvider.id).toBe('baidu');
    expect(baiduProvider.name).toBe('Baidu');
    expect(baiduProvider.isFree).toBe(true);
    expect(baiduProvider.languages).toContain('zh');
  });

  it('searchBaidu returns array', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        url: 'https://www.baidu.com/s?wd=test+query',
        text: async () => '<html><body>test</body></html>',
      }) as Response;

      const results = await searchBaidu('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBaidu returns empty array on fetch error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchBaidu('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchBaidu returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        url: 'https://www.baidu.com/s?wd=test+query',
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchBaidu('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports an unexpected 200 HTML shape instead of a successful empty result', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>百度一下</title></head><body>changed</body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBaidu('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'parse_error',
          retryable: false,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports known outer-container with unknown card drift as parse_error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        `<html><body>
          <div id="content_left">
            <article class="new-result-card">
              <h3><a href="https://example.com/drift">Drifted result</a></h3>
            </article>
          </div>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBaidu('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'parse_error',
          retryable: false,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns an empty array by default for known outer-container with unknown card drift', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        `<html><body>
          <div id="content_left">
            <article class="new-result-card">
              <h3><a href="https://example.com/drift">Drifted result</a></h3>
            </article>
          </div>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBaidu('test query', 5)).resolves.toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps a valid zero-result search page as an empty success', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>百度一下</title></head><body><div id="content_left"></div></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchBaidu('没有匹配结果', 5, { throwOnError: true }))
        .resolves.toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('parseBaiduHTML snippet extraction', () => {
  it('extracts snippet from classic c-abstract div', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/article" target="_blank">Example Article Title</a></h3>
  <div class="c-abstract">This is a classic Baidu snippet about the article.</div>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Example Article Title');
    expect(results[0].url).toBe('https://example.com/article');
    expect(results[0].snippet).toBe('This is a classic Baidu snippet about the article.');
    expect(results[0].source).toBe('baidu');
  });

  it('extracts snippet from c-abstract span variant', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/post" target="_blank">Another Great Post</a></h3>
  <span class="c-abstract">Snippet inside a span with c-abstract class.</span>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Another Great Post');
    expect(results[0].snippet).toBe('Snippet inside a span with c-abstract class.');
  });

  it('extracts snippet from content-right_* class (new-style Baidu)', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/guide" target="_blank">Complete Guide to TypeScript</a></h3>
  <span class="content-right_abc">This is the new-style Baidu snippet about TypeScript programming.</span>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Complete Guide to TypeScript');
    expect(results[0].snippet).toBe('This is the new-style Baidu snippet about TypeScript programming.');
  });

  it('falls back to generic span with 20-200 chars when no known snippet class', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/fallback" target="_blank">Fallback Test Page</a></h3>
  <span>This span has enough text to qualify as a valid snippet.</span>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Fallback Test Page');
    expect(results[0].snippet).toBe('This span has enough text to qualify as a valid snippet.');
  });

  it('returns empty snippet when no snippet element exists', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/minimal" target="_blank">Minimal Result No Snippet</a></h3>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Minimal Result No Snippet');
    expect(results[0].snippet).toBe('');
  });

  it('skips baidu.com internal URLs', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://www.baidu.com/link?url=xxx" target="_blank">Internal Link</a></h3>
  <div class="c-abstract">Should be skipped.</div>
</div>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/real" target="_blank">Real Result</a></h3>
  <div class="c-abstract">Real snippet text here.</div>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/real');
    expect(results[0].snippet).toBe('Real snippet text here.');
  });

  it('uses Baidu card landing URLs when result links are redirect URLs', () => {
    const html = `<html><body>
<div class="c-container" data-landurl="https://example.com/landing">
  <h3><a href="https://www.baidu.com/link?url=redirect-token">Landing Result</a></h3>
  <div class="c-abstract">Landing page snippet.</div>
</div>
<div class="c-container" mu="https://example.com/entity">
  <h3><a href="https://www.baidu.com/link?url=entity-token">Entity Result</a></h3>
  <div class="c-abstract">Entity page snippet.</div>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results.map(result => result.url)).toEqual([
      'https://example.com/landing',
      'https://example.com/entity',
    ]);
  });

  it('respects the limit parameter', () => {
    const makeBlock = (i: number) => `<div class="result c-container">
  <h3 class="t"><a href="https://example.com/${i}" target="_blank">Result ${i}</a></h3>
  <div class="c-abstract">Snippet for result ${i}.</div>
</div>`;

    const html = `<html><body>${Array.from({ length: 10 }, (_, i) => makeBlock(i + 1)).join('\n')}</body></html>`;

    const results = parseBaiduHTML(html, 3);
    expect(results).toHaveLength(3);
    expect(results[0].title).toBe('Result 1');
    expect(results[2].title).toBe('Result 3');
  });

  it('returns empty array for HTML with no h3 result blocks', () => {
    const html = '<html><body><p>No results here</p></body></html>';
    const results = parseBaiduHTML(html, 10);
    expect(results).toEqual([]);
  });

  it('decodes HTML entities in snippet text', () => {
    const html = `<html><body>
<div class="result c-container">
  <h3 class="t"><a href="https://example.com/entity" target="_blank">Entity Test</a></h3>
  <div class="c-abstract">A &amp; B &lt; C &gt; D — decoded snippet.</div>
</div>
</body></html>`;

    const results = parseBaiduHTML(html, 10);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe('A & B < C > D — decoded snippet.');
  });
});
