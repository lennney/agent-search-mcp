import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchDuckDuckGo } from '../../src/engines/duckduckgo.js';
import { searchDuckDuckGoHtml, searchDuckDuckGoLiteHtml } from '../../src/engines/duckduckgo-html.js';
import { resolveSearchRequestContext, type SearchMarket } from '../../src/engines/search-request-context.js';

import { searchProvider, providerRuntimeRegistry } from '../../src/engines/runtime-registry.js';
import { SEARCH_PROVIDERS } from '../../src/engines/provider-catalog.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

function mockResponses(filter: string, results: unknown[] = []) {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(`<link id="deep_preload_link" href="https://links.duckduckgo.com/d.js?q=test&vqd=token${filter}">`))
    .mockResolvedValueOnce(Response.json({ results }));
  global.fetch = fetch;
  return fetch;
}

describe('explicit DDG native time range', () => {
  it.each([['day', 'd'], ['week', 'w'], ['month', 'm'], ['year', 'y']] as const)(
    'requires provider-issued %s filter and preserves it', async (nativeTimeRange, df) => {
      const fetch = mockResponses(`&df=${df}`, [{ t: 'Result', u: 'https://example.org/', a: 'Snippet' }]);
      const results = await searchDuckDuckGo('test', 10, { nativeTimeRange });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('df')).toBe(df);
      expect(new URL(String(fetch.mock.calls[1][0])).searchParams.getAll('df')).toEqual([df]);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toHaveProperty('published_at');
    },
  );
  it.each(['', '&df=w', '&df=d&df=d', '&df=d&df=w'])('fails closed for unverified %s without fetching results or fallback', async filter => {
    const fetch = mockResponses(filter);
    await expect(searchDuckDuckGo('test', 10, { nativeTimeRange: 'day' })).rejects.toMatchObject({ failureType: 'validation_error', retryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('returns valid empty filtered results without HTML or Lite fallback', async () => {
    const fetch = mockResponses('&df=d');
    await expect(searchDuckDuckGo('test', 10, { nativeTimeRange: 'day' })).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not fall back on bootstrap transport failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(searchDuckDuckGo('test', 10, { nativeTimeRange: 'day' })).rejects.toThrow('offline');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects native filters on all other providers before network or paid work', async () => {
    global.fetch = vi.fn();
    for (const provider of SEARCH_PROVIDERS.filter(provider => provider !== 'duckduckgo')) {
      await expect(searchProvider(provider, 'test', 10, { nativeTimeRange: 'day' })).rejects.toMatchObject({ failureType: 'validation_error' });
      await expect(providerRuntimeRegistry[provider].search('test', 10, { nativeTimeRange: 'day' })).rejects.toMatchObject({ failureType: 'validation_error' });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects direct HTML and Lite native requests before network access', async () => {
    global.fetch = vi.fn();
    for (const search of [searchDuckDuckGoHtml, searchDuckDuckGoLiteHtml]) {
      await expect(search('test', 10, { nativeTimeRange: 'day' })).rejects.toMatchObject({ failureType: 'validation_error' });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('independent market and language', () => {
  it.each([['en', 'CN', 'cn-zh', 'en-US,en;q=0.9'], ['zh', 'US', 'us-en', 'zh-CN,zh;q=0.9,en;q=0.8'], ['en', 'MY', 'my-en', 'en-US,en;q=0.9'], ['en', 'SG', 'sg-en', 'en-US,en;q=0.9'], ['zh', 'MY', 'my-en', 'zh-CN,zh;q=0.9,en;q=0.8'], ['zh', 'SG', 'sg-en', 'zh-CN,zh;q=0.9,en;q=0.8']] as const)(
    'keeps %s language with %s market', async (language, market, region, acceptLanguage) => {
      const requestContext = resolveSearchRequestContext('test', language, market);
      expect(requestContext).toEqual({ language, market, region, acceptLanguage });
      const fetch = mockResponses('&df=d');
      await searchDuckDuckGo('test', 10, { requestContext, nativeTimeRange: 'day' });
      expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('kl')).toBe(region);
      expect(new Headers(fetch.mock.calls[0][1].headers).get('accept-language')).toBe(acceptLanguage);
    },
  );
  it('rejects unsupported market mappings rather than guessing', () => {
    expect(() => resolveSearchRequestContext('test', 'en', 'ZZ' as SearchMarket)).toThrow('Unsupported search market');
  });
  it('preserves legacy language-dependent defaults when market is omitted', () => {
    expect(resolveSearchRequestContext('test', 'en')).toEqual({ language: 'en', region: 'us-en', acceptLanguage: 'en-US,en;q=0.9' });
    expect(resolveSearchRequestContext('test', 'zh')).not.toHaveProperty('market');
  });
});
