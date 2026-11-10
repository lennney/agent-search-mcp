import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createResultScope } from '../../src/aggregation/result-scope.js';
import { loadConfig } from '../../src/infrastructure/config.js';
import { createSearchRuntime } from '../../src/infrastructure/search-runtime.js';
import { isNoRetention, withSearchPrivacy } from '../../src/infrastructure/request-privacy.js';
import { SearchCache } from '../../src/infrastructure/cache.js';
import { searchWithFallback, setupFreeSearchTool } from '../../src/tools/free-search.js';
import { registerFreeSearchAdvanced } from '../../src/tools/free-search-advanced.js';
import type { SearchProvider, SearchResult } from '../../src/types.js';

function result(url: string, source: string): SearchResult {
  return { url, title: `Developer reference ${url}`, snippet: 'Developer reference documentation with detailed testing examples and useful guidance.', source };
}
function runtimeFor(provider = vi.fn(async (engine: SearchProvider) => [result('https://example.com/docs/guide', engine)])) {
  const cache = { get: vi.fn(() => null), set: vi.fn(), stats: () => ({ hits: 0, misses: 0, size: 0, maxSize: 10 }) };
  const runtime = createSearchRuntime({
    config: { ...loadConfig(), searchBudgetMaxResults: 2, semanticDedup: false, semanticRerank: false },
    cache, searchProvider: provider,
    rateLimiter: { waitForSlot: async () => {}, getAllRateLimits: () => ({}) },
  });
  return { runtime, cache, provider };
}
afterEach(() => vi.restoreAllMocks());

describe('request search controls', () => {
  it('enforces domain and case-sensitive path boundaries without broadening repeated slashes', () => {
    const matches = createResultScope(['example.com/docs'], ['example.com/docs/private']);
    expect(matches('https://sub.example.com/docs/a')).toBe(true);
    for (const url of ['https://example.com/docs-old', 'https://evil-example.com/docs', 'https://example.com/DOCS', 'https://example.com/docs/private/a']) expect(matches(url)).toBe(false);
    const double = createResultScope(['example.com//']);
    expect(double('https://example.com/a')).toBe(false);
    expect(double('https://example.com//a')).toBe(true);
    expect(() => createResultScope(['//'])).toThrow();
    const excluded = createResultScope(undefined, ['example.com//']);
    expect(excluded('https://example.com/a')).toBe(true);
    expect(excluded('https://example.com//a')).toBe(false);
    expect(createResultScope(['example.com/docs'])('https://example.com/docs%2fold/a')).toBe(false);
    expect(createResultScope(['example.com/docs%2fold'])('https://example.com/docs/old')).toBe(false);
    expect(createResultScope(['example.com/docs%2fold'])('https://example.com/docs%2fold/a')).toBe(true);
    expect(() => createResultScope(['example.com/docs/%2e%2e'])).toThrow();
  });

  it.each([false, true])('filters before result budget in waterfall=%s and preserves literal query', async waterfall => {
    const provider = vi.fn(async (engine: SearchProvider) => [
      result('https://outside.test/a', engine), result('https://example.com/docs-old/a', engine),
      result('https://example.com/docs/guide', engine),
    ]);
    const { runtime } = runtimeFor(provider);
    const query = '  精确 developer query "x"  ';
    const response = await searchWithFallback({ query, engines: ['duckduckgo', 'sogou'], includeDomains: ['example.com/docs'], queryMode: 'literal', waterfall, waterfallMinConfidence: 1, waterfallMinResults: 10 }, runtime);
    expect(response.results.map(item => item.url)).toEqual(['https://example.com/docs/guide']);
    expect(provider.mock.calls.length).toBeGreaterThan(0);
    for (const call of provider.mock.calls) expect((call as unknown[])[1]).toBe(query);
    expect(response.meta.execution?.phases_completed).not.toContain('3');
    expect(response.meta.execution?.budget?.observed.result_count).toBeLessThanOrEqual(2);
  });

  it('continues same-family adapter fallback when every earlier URL is outside scope', async () => {
    const provider = vi.fn(async (engine: SearchProvider) => [result(engine === 'duckduckgo' ? 'https://outside.test/a' : 'https://example.com/docs/guide', engine)]);
    const { runtime } = runtimeFor(provider);
    const response = await searchWithFallback({ query: 'developer reference', engines: ['duckduckgo', 'bing'], includeDomains: ['example.com/docs'], queryMode: 'literal' }, runtime);
    expect(provider.mock.calls.map(call => call[0])).toEqual(['duckduckgo', 'bing']);
    expect(response.results).toHaveLength(1);
  });

  it('keeps no_retention local, concurrent-safe, uncached and uncollapsed including delayed writes', async () => {
    const contexts: boolean[] = [];
    const provider = vi.fn(async (engine: SearchProvider) => {
      await new Promise(resolve => setImmediate(resolve));
      contexts.push(isNoRetention());
      return [result('https://example.com/docs/guide', engine)];
    });
    const { runtime, cache } = runtimeFor(provider);
    const options = { query: 'private reference', engines: ['wikipedia'] as SearchProvider[], queryMode: 'literal' as const };
    const responses = await Promise.all([
      searchWithFallback({ ...options, privacy: 'no_retention' }, runtime),
      searchWithFallback({ ...options, privacy: 'no_retention' }, runtime),
      searchWithFallback(options, runtime),
    ]);
    await new Promise(resolve => setImmediate(resolve));
    expect(contexts.sort()).toEqual([false, true, true]);
    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(responses[0].security_note).toContain('Upstream providers');
    expect(isNoRetention()).toBe(false);
    const localCache = new SearchCache();
    localCache.set('existing', 'data');
    withSearchPrivacy('no_retention', () => {
      expect(localCache.get('existing')).toBeNull();
      localCache.set('new', 'data');
    });
    expect(localCache.get('new')).toBeNull();
    expect(localCache.get('existing')).toBe('data');
  });

  it('combines native time, market, literal, scope and privacy without fallbacks', async () => {
    const { runtime, provider, cache } = runtimeFor();
    const response = await searchWithFallback({ query: '原样 "reference"', engines: ['duckduckgo'], market: 'US', language: 'zh', timeRange: 'week', timeRangeMode: 'provider_native', queryMode: 'literal', privacy: 'no_retention', includeDomains: ['example.com/docs'], waterfall: true }, runtime);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith('duckduckgo', '原样 "reference"', 10, expect.objectContaining({ nativeTimeRange: 'week', requestContext: expect.objectContaining({ language: 'zh', region: 'us-en' }) }));
    expect(response.results).toHaveLength(1);
    expect(cache.get).not.toHaveBeenCalled();
    await expect(searchWithFallback({ query: 'x', timeRange: 'week', engines: ['sogou'] }, runtime)).rejects.toThrow('UNSUPPORTED_FILTER');
  });

  it('reports market support, not successful application, when an adapter fails', async () => {
    const provider = vi.fn(async (_engine: SearchProvider): Promise<SearchResult[]> => { throw new Error('upstream unavailable'); });
    const { runtime } = runtimeFor(provider);
    const response = await searchWithFallback({ query: 'reference', engines: ['duckduckgo'], market: 'MY', queryMode: 'literal', providerMaxRetries: 0 }, runtime);
    expect(response.partialFailures).toHaveLength(1);
    expect(response.meta.request_controls).toMatchObject({ market: 'MY', market_supported_by: ['duckduckgo'] });
    expect(response.meta.request_controls).not.toHaveProperty('market_applied_by');
  });

  it('rejects unknown and conflicting MCP arguments on both tools before dispatch', async () => {
    const { runtime, provider } = runtimeFor();
    const server = new McpServer({ name: 'controls', version: '1' });
    setupFreeSearchTool(server, runtime);
    registerFreeSearchAdvanced(server, runtime);
    const client = new Client({ name: 'controls-test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    try {
      for (const name of ['free_search', 'free_search_advanced']) {
        for (const extra of [{ max_spend: 0 }, { allow_paid: false }, { include_domain: ['example.com'] }, { no_retention: true }, { count: 1, limit: 2 }]) {
          const response = await client.callTool({ name, arguments: { query: 'reference', ...extra } });
          expect(response.isError).toBe(true);
        }
        const response = await client.callTool({ name, arguments: { query: 'reference', count: 1, limit: 1, engines: ['wikipedia'], enrich: false } });
        // free_search rejects advanced-only controls rather than silently stripping them.
        expect(response.isError).toBe(name === 'free_search' ? true : undefined);
      }
      expect(provider).toHaveBeenCalledTimes(1);
    } finally { await client.close(); await server.close(); }
  });
});
