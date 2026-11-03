import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('KeenableProvider', () => {
  let KeenableProvider: typeof import('../../src/engines/keenable.js').KeenableProvider;
  let provider: InstanceType<typeof import('../../src/engines/keenable.js').KeenableProvider>;

  beforeEach(async () => {
    const mod = await import('../../src/engines/keenable.js');
    KeenableProvider = mod.KeenableProvider;
    provider = new KeenableProvider();
    global.fetch = vi.fn();
  });

  it('returns empty array when KEENABLE_API_KEY is not set', async () => {
    delete process.env.KEENABLE_API_KEY;
    const results = await provider.search('test', 10);
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches from Keenable API and maps results', async () => {
    process.env.KEENABLE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'T1', url: 'https://ex.com/1', snippet: 'Content 1' },
          { title: 'T2', url: 'https://ex.com/2', snippet: 'Content 2' },
        ],
      }),
    });
    const results = await provider.search('test query', 5);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('T1');
    expect(results[0].source).toBe('keenable');
  });

  it('throws on HTTP error', async () => {
    process.env.KEENABLE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });
    await expect(provider.search('test', 5)).rejects.toThrow('Keenable returned 500');
  });

  it('handles empty results gracefully', async () => {
    process.env.KEENABLE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const results = await provider.search('test', 5);
    expect(results).toEqual([]);
  });

  it('sends POST with correct body', async () => {
    process.env.KEENABLE_API_KEY = 'test-key';
    let body: any;
    let opts_headers: any;
    (global.fetch as any).mockImplementation(async (_url: string, opts: any) => {
      body = JSON.parse(opts.body);
      opts_headers = opts.headers;
      return { ok: true, json: async () => ({ results: [] }) };
    });
    await provider.search('hello', 7);
    expect(body.query).toBe('hello');
    expect(body.max_results).toBe(7);
    expect(opts_headers['X-API-Key']).toBe('test-key');
  });

  it('ignores malformed or unsafe result entries', async () => {
    process.env.KEENABLE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          null,
          { title: 'Unsafe', url: 'data:text/plain,test' },
          { title: 'Valid', url: 'https://example.com', snippet: 'Content' },
        ],
      }),
    });

    await expect(provider.search('test', 5)).resolves.toEqual([{
      title: 'Valid',
      url: 'https://example.com',
      snippet: 'Content',
      source: 'keenable',
      engines: ['keenable'],
    }]);
  });
});
