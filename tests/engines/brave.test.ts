import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('BraveProvider', () => {
  let BraveProvider: typeof import('../../src/engines/brave.js').BraveProvider;
  let provider: InstanceType<typeof import('../../src/engines/brave.js').BraveProvider>;

  beforeEach(async () => {
    const mod = await import('../../src/engines/brave.js');
    BraveProvider = mod.BraveProvider;
    provider = new BraveProvider();
    global.fetch = vi.fn();
  });

  it('returns empty array when BRAVE_API_KEY is not set', async () => {
    delete process.env.BRAVE_API_KEY;
    const results = await provider.search('test', 10);
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches from Brave API and maps results', async () => {
    process.env.BRAVE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Result 1', url: 'https://ex.com/1', description: 'Desc 1' },
            { title: 'Result 2', url: 'https://ex.com/2', description: 'Desc 2' },
          ],
        },
      }),
    });
    const results = await provider.search('test query', 5);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Result 1');
    expect(results[0].source).toBe('brave');
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('throws on HTTP error', async () => {
    process.env.BRAVE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({ ok: false, status: 429 });
    await expect(provider.search('test', 5)).rejects.toThrow('Brave returned 429');
  });

  it('handles empty results gracefully', async () => {
    process.env.BRAVE_API_KEY = 'test-key';
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });
    const results = await provider.search('test', 5);
    expect(results).toEqual([]);
  });
});
