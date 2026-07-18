import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('TavilyProvider', () => {
  let TavilyProvider: typeof import('../../src/engines/tavily.js').TavilyProvider;
  let provider: InstanceType<typeof import('../../src/engines/tavily.js').TavilyProvider>;

  beforeEach(async () => {
    const mod = await import('../../src/engines/tavily.js');
    TavilyProvider = mod.TavilyProvider;
    provider = new TavilyProvider();
    global.fetch = vi.fn();
  });

  it('returns empty array when TAVILY_API_KEY is not set', async () => {
    delete process.env.TAVILY_API_KEY;
    const results = await provider.search('test', 10);
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches from Tavily API and maps results', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'T1', url: 'https://ex.com/1', content: 'Content 1' },
          { title: 'T2', url: 'https://ex.com/2', content: 'Content 2' },
        ],
      }),
    });
    const results = await provider.search('test query', 5);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('T1');
    expect(results[0].source).toBe('tavily');
  });

  it('throws on HTTP error', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });
    await expect(provider.search('test', 5)).rejects.toThrow('Tavily returned 500');
  });

  it('handles empty results gracefully', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const results = await provider.search('test', 5);
    expect(results).toEqual([]);
  });

  it('sends POST with correct body', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    let body: any;
    (global.fetch as any).mockImplementation(async (_url: string, opts: any) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ results: [] }) };
    });
    await provider.search('hello', 7);
    expect(body.query).toBe('hello');
    expect(body.max_results).toBe(7);
    expect(body.api_key).toBe('test-key');
  });
});
