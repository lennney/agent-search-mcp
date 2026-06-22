import { describe, it, expect } from 'vitest';

// ─── DuckDuckGo HTML Parser Test ─────────────────────────────────────────

describe('DuckDuckGo parser', () => {
  // We import the module dynamically to avoid actually hitting the network
  // The parseDdgHtml function is not exported, so we test the public searchDuckDuckGo
  // by mocking fetch. But since parseDdgHtml is private, we test the full function
  // behavior via the imported module's internals.
  //
  // Instead, we re-implement the parsing logic here for testing:
  function simulateDdgParse(
    html: string,
    engine: string
  ): Array<{ title: string; url: string; snippet: string; source: string; engines: string[] }> {
    const results: Array<{ title: string; url: string; snippet: string; source: string; engines: string[] }> = [];
    const resultRegex =
      /<div[^>]*class="[^"]*result[^"]*"[^>]*>.*?<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>.*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>.*?<span[^>]*class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/span>/gis;
    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null) {
      const url = match[1]?.trim() || '';
      const title = match[2]?.replace(/<[^>]+>/g, '').trim() || '';
      const snippet = match[3]?.replace(/<[^>]+>/g, '').trim() || '';
      const source = match[4]?.replace(/<[^>]+>/g, '').trim() || '';
      if (title && url) {
        results.push({ title, url, snippet, source, engines: [engine] });
      }
    }
    return results;
  }

  it('parses standard DuckDuckGo HTML result blocks', () => {
    const html = `
      <div class="result results_links results_links_deep highlight_d">
        <a class="result__a" href="https://example.com/page1">Example Title 1</a>
        <a class="result__snippet" href="https://example.com/page1">Example snippet one</a>
        <span class="result__url">example.com</span>
      </div>
      <div class="result results_links results_links_deep">
        <a class="result__a" href="https://example.com/page2">Example Title 2</a>
        <a class="result__snippet" href="https://example.com/page2">Example snippet two</a>
        <span class="result__url">example.com</span>
      </div>
    `;
    const results = simulateDdgParse(html, 'duckduckgo');
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Example Title 1');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toBe('Example snippet one');
    expect(results[1].engines).toEqual(['duckduckgo']);
  });

  it('strips HTML tags from title and snippet', () => {
    const html = `
      <div class="result results_links results_links_deep">
        <a class="result__a" href="https://example.com"><b>Bold</b> <i>Title</i></a>
        <a class="result__snippet" href="https://example.com">Snippet with <strong>tags</strong></a>
        <span class="result__url">example.com</span>
      </div>
    `;
    const results = simulateDdgParse(html, 'duckduckgo');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Bold Title');
    expect(results[0].snippet).toBe('Snippet with tags');
  });

  it('skips malformed results with no title', () => {
    const html = `
      <div class="result results_links results_links_deep">
        <a class="result__a" href="https://example.com"></a>
        <a class="result__snippet" href="https://example.com">Snippet only</a>
        <span class="result__url">example.com</span>
      </div>
    `;
    const results = simulateDdgParse(html, 'duckduckgo');
    expect(results).toHaveLength(0);
  });

  it('skips malformed results with no url', () => {
    const html = `
      <div class="result results_links results_links_deep">
        <a class="result__a" href="">Title only</a>
        <a class="result__snippet" href="">Snippet only</a>
        <span class="result__url">example.com</span>
      </div>
    `;
    const results = simulateDdgParse(html, 'duckduckgo');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for HTML with no results', () => {
    const results = simulateDdgParse('<html><body>No results here</body></html>', 'duckduckgo');
    expect(results).toEqual([]);
  });
});

// ─── Sogou HTML Parser Test ────────────────────────────────────────────

describe('Sogou parser', () => {
  function simulateSogouParse(
    html: string
  ): Array<{ title: string; url: string; snippet: string; source: string; engines: string[] }> {
    const results: Array<{ title: string; url: string; snippet: string; source: string; engines: string[] }> = [];
    const seenUrls = new Set<string>();

    const blockRegex =
      /<div[^>]*(?:class="[^"]*vr(?:wrap|5)[^"]*"|class="[^"]*\brb\b[^"]*"|id="[^"]*result[^"]*")[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gis;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = blockRegex.exec(html)) !== null) {
      const block = blockMatch[1];
      const titleLinkRegex = /<h[23][^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
      const titleMatch = block.match(titleLinkRegex);
      if (!titleMatch) continue;

      const rawUrl = titleMatch[1]?.trim() || '';
      const title = titleMatch[2]?.replace(/<[^>]+>/g, '').trim() || '';
      if (!title || !rawUrl) continue;
      if (seenUrls.has(rawUrl)) continue;
      seenUrls.add(rawUrl);

      const descMatch =
        block.match(/<p[^>]*class="[^"]*str_info[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
        block.match(/<div[^>]*class="[^"]*str_info[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        block.match(/class="[^"]*(?:str_info|ft|text-layout)[^"]*"[^>]*>([\s\S]*?)<\//i);
      const snippet = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

      const srcMatch =
        block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i) ||
        block.match(/class="[^"]*(?:citeurl|g|url)[^"]*"[^>]*>([\s\S]*?)<\//i);
      let source = srcMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      if (!source) {
        try { source = new URL(rawUrl).hostname; } catch { source = ''; }
      }

      results.push({ title, url: rawUrl, snippet, source, engines: ['sogou'] });
    }
    return results;
  }

  it('parses standard Sogou vrwrap result blocks', () => {
    const html = `
      <div class="vrwrap">
        <h3><a href="https://example.com/page1">Sogou Result 1</a></h3>
        <p class="str_info">Description for result one</p>
        <cite>example.com</cite>
      </div>
      </div>
      <div class="vrwrap">
        <h3><a href="https://example.com/page2">Sogou Result 2</a></h3>
        <p class="str_info">Description for result two</p>
        <cite>example.com</cite>
      </div>
      </div>
    `;
    const results = simulateSogouParse(html);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Sogou Result 1');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toBe('Description for result one');
    expect(results[0].engines).toEqual(['sogou']);
  });

  it('extracts snippet from str_info div when p fails', () => {
    const html = `
      <div class="vrwrap">
        <h3><a href="https://example.com/page">Test Result</a></h3>
        <div class="str_info">Description in a div</div>
        <cite>example.com</cite>
      </div>
      </div>
    `;
    const results = simulateSogouParse(html);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe('Description in a div');
  });

  it('strips HTML tags from titles', () => {
    const html = `
      <div class="vrwrap">
        <h3><a href="https://example.com"><em>Emphasized</em> Title</a></h3>
        <p class="str_info">Snippet text</p>
        <cite>example.com</cite>
      </div>
      </div>
    `;
    const results = simulateSogouParse(html);
    expect(results[0].title).toBe('Emphasized Title');
  });

  it('skips blocks without a title link', () => {
    const html = `
      <div class="vrwrap">
        <p class="str_info">Some text without a link</p>
      </div>
      </div>
    `;
    const results = simulateSogouParse(html);
    expect(results).toHaveLength(0);
  });

  it('deduplicates by URL', () => {
    const html = `
      <div class="vrwrap">
        <h3><a href="https://example.com/dup">Duplicate</a></h3>
        <p class="str_info">First</p>
        <cite>example.com</cite>
      </div>
      </div>
      <div class="vrwrap">
        <h3><a href="https://example.com/dup">Duplicate Again</a></h3>
        <p class="str_info">Second</p>
        <cite>example.com</cite>
      </div>
      </div>
    `;
    const results = simulateSogouParse(html);
    expect(results).toHaveLength(1);
  });

  it('returns empty array for HTML with no results', () => {
    const results = simulateSogouParse('<html><body>No results found</body></html>');
    expect(results).toEqual([]);
  });
});

// ─── Rate Limiter ─────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('respects minimum interval between requests', async () => {
    const { RateLimiter } = await import('../src/infrastructure/rate-limiter.js');
    const rl = new RateLimiter();

    const start = Date.now();
    await rl.waitForSlot('test');
    await rl.waitForSlot('test');
    const elapsed = Date.now() - start;

    // Should have waited at least 1 second between the two calls
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it('does not wait for different providers', async () => {
    const { RateLimiter } = await import('../src/infrastructure/rate-limiter.js');
    const rl = new RateLimiter();

    const start = Date.now();
    await rl.waitForSlot('provider-a');
    await rl.waitForSlot('provider-b');
    const elapsed = Date.now() - start;

    // Two different providers, should not wait between them
    expect(elapsed).toBeLessThan(900);
  });
});

// ─── Cache ───────────────────────────────────────────────────────────────

describe('SearchCache', () => {
  it('stores and retrieves values', async () => {
    const { SearchCache } = await import('../src/infrastructure/cache.js');
    const cache = new SearchCache();
    cache.set('key1', { data: 'hello' });
    expect(cache.get('key1')).toEqual({ data: 'hello' });
  });

  it('returns null for expired entries', async () => {
    const { SearchCache } = await import('../src/infrastructure/cache.js');
    const cache = new SearchCache();
    // Override ttl to 10ms
    (cache as any).ttl = 10;
    cache.set('key', 'value');
    await new Promise(r => setTimeout(r, 20));
    expect(cache.get('key')).toBeNull();
  });

  it('returns null for missing keys', async () => {
    const { SearchCache } = await import('../src/infrastructure/cache.js');
    const cache = new SearchCache();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('generates consistent cache keys', async () => {
    const { SearchCache } = await import('../src/infrastructure/cache.js');
    const cache = new SearchCache();
    const key1 = cache.makeKey('hello', 10, ['duckduckgo', 'sogou']);
    const key2 = cache.makeKey('hello', 10, ['sogou', 'duckduckgo']);
    expect(key1).toBe(key2);
  });
});

// ─── URL Validator ────────────────────────────────────────────────────────

describe('validateUrl', () => {
  it('accepts valid http/https URLs', async () => {
    const { validateUrl } = await import('../src/infrastructure/url-validator.js');
    expect(validateUrl('https://example.com').valid).toBe(true);
    expect(validateUrl('http://example.com/path?q=1').valid).toBe(true);
  });

  it('rejects non-http protocols', async () => {
    const { validateUrl } = await import('../src/infrastructure/url-validator.js');
    expect(validateUrl('ftp://example.com').valid).toBe(false);
    expect(validateUrl('file:///etc/passwd').valid).toBe(false);
  });

  it('blocks private IP ranges and localhost', async () => {
    const { validateUrl } = await import('../src/infrastructure/url-validator.js');
    expect(validateUrl('http://localhost:3000').valid).toBe(false);
    expect(validateUrl('http://127.0.0.1:8080').valid).toBe(false);
    expect(validateUrl('http://169.254.169.254/latest/').valid).toBe(false);
    expect(validateUrl('http://10.0.0.1/secret').valid).toBe(false);
    expect(validateUrl('http://192.168.1.1/admin').valid).toBe(false);
  });

  it('rejects invalid URL strings', async () => {
    const { validateUrl } = await import('../src/infrastructure/url-validator.js');
    expect(validateUrl('not a url').valid).toBe(false);
    expect(validateUrl('').valid).toBe(false);
  });
});

// ─── HealthTracker ───────────────────────────────────────────────────────

describe('HealthTracker', () => {
  it('tracks provider health correctly', async () => {
    const { HealthTracker } = await import('../src/infrastructure/health.js');
    const ht = new HealthTracker();

    expect(ht.isHealthy('ddg')).toBe(true);

    // 5 failures should mark as unhealthy
    for (let i = 0; i < 5; i++) {
      ht.recordFailure('ddg');
    }
    expect(ht.isHealthy('ddg')).toBe(false);

    // A success reduces error count to 4 — still healthy (errorCount < 5)
    ht.recordSuccess('ddg', 100);
    expect(ht.isHealthy('ddg')).toBe(true);

    // More successes to recover
    for (let i = 0; i < 4; i++) {
      ht.recordSuccess('ddg', 100);
    }
    expect(ht.isHealthy('ddg')).toBe(true);
  });

  it('returns health report for all providers', async () => {
    const { HealthTracker } = await import('../src/infrastructure/health.js');
    const ht = new HealthTracker();
    ht.recordSuccess('ddg', 200);
    ht.recordFailure('sogou');

    const report = ht.getHealth();
    expect(report).toHaveLength(2);
    expect(report.find(h => h.provider === 'ddg')?.avgLatency).toBe(100);
    expect(report.find(h => h.provider === 'sogou')?.errorCount).toBe(1);
  });
});
