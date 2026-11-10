import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../../src/infrastructure/config.js';
import { createSearchRuntime } from '../../src/infrastructure/search-runtime.js';
import { searchProvider } from '../../src/engines/runtime-registry.js';
import { setupFreeSearchTool } from '../../src/tools/free-search.js';
import { registerFreeSearchAdvanced } from '../../src/tools/free-search-advanced.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('public native-time failure isolation with real DDG adapter', () => {
  it.each(['free_search', 'free_search_advanced'])('%s rejects unverified filter without cached, unfiltered or paid fallback', async name => {
    vi.stubEnv('BRAVE_API_KEY', 'dummy-never-send');
    vi.stubEnv('TAVILY_API_KEY', 'dummy-never-send');
    const dispatcher = vi.fn(searchProvider);
    const cache = { get: vi.fn(() => ({ results: [{ url: 'https://unfiltered.test/' }] })), set: vi.fn(), stats: () => ({ hits: 0, misses: 0, size: 1, maxSize: 10 }) };
    const runtime = createSearchRuntime({
      config: { ...loadConfig(), searchProviderMode: 'quality_escalation', semanticDedup: false, semanticRerank: false },
      searchProvider: dispatcher, cache,
      rateLimiter: { waitForSlot: async () => {}, getAllRateLimits: () => ({}) },
    });
    // This URL lacks df. Fetch must never reach a result endpoint or another engine.
    global.fetch = vi.fn().mockResolvedValue(new Response('<link id="deep_preload_link" href="https://links.duckduckgo.com/d.js?q=test&vqd=token">'));
    const server = new McpServer({ name: 'native-test', version: '1' });
    setupFreeSearchTool(server, runtime); registerFreeSearchAdvanced(server, runtime);
    const client = new Client({ name: 'native-test-client', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    try {
      const response = await client.callTool({ name, arguments: {
        query: 'test', engines: ['duckduckgo'], time_range: 'day', time_range_mode: 'provider_native', market: 'MY',
        ...(name === 'free_search_advanced' ? { enrich: false, waterfall: true } : {}),
      } });
      const payload = response.structuredContent as { results: unknown[]; partialFailures: Array<{ engine: string; type: string }> };
      expect(payload.results).toEqual([]);
      expect(payload.partialFailures).toEqual(expect.arrayContaining([expect.objectContaining({ engine: 'duckduckgo', type: 'validation_error' })]));
      expect(dispatcher).toHaveBeenCalledTimes(1);
      expect(dispatcher.mock.calls[0][0]).toBe('duckduckgo');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const url = new URL(String(vi.mocked(global.fetch).mock.calls[0][0]));
      expect(url.origin).toBe('https://duckduckgo.com');
      expect(url.searchParams.get('df')).toBe('d');
      expect(url.searchParams.get('kl')).toBe('my-en');
      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    } finally { await client.close(); await server.close(); }
  });
});
