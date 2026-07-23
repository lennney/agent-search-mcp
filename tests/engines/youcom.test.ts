import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchYouCom, youcomProvider } from '../../src/engines/youcom.js';

describe('You.com engine', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.YDC_API_KEY;
  });

  it('has correct provider metadata', () => {
    expect(youcomProvider.id).toBe('youcom');
    expect(youcomProvider.name).toBe('You.com Search');
    expect(youcomProvider.isFree).toBe(false);
    expect(youcomProvider.languages).toContain('en');
  });

  it('searchYouCom returns mapped web and news results without an API key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          web: [
            {
              title: 'Web Result',
              url: 'https://example.com/web',
              description: 'Web snippet',
            },
          ],
          news: [
            {
              title: 'News Result',
              url: 'https://example.com/news',
              snippets: ['News snippet'],
            },
          ],
        },
      }),
    });

    const results = await searchYouCom('test query', 5);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Web Result',
      url: 'https://example.com/web',
      snippet: 'Web snippet',
      source: 'youcom',
    });
    expect(results[1]).toMatchObject({
      title: 'News Result',
      url: 'https://example.com/news',
      snippet: 'News snippet',
      source: 'youcom',
    });
    expect(results[0].engines).toEqual(['youcom']);
  });

  it('searchYouCom sends YDC_API_KEY when configured', async () => {
    process.env.YDC_API_KEY = 'test-key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: { web: [] } }),
    });

    await searchYouCom('test query', 5);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Accept: 'application/json',
      'X-API-Key': 'test-key',
    });
  });

  it('searchYouCom throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(searchYouCom('test query', 5)).rejects.toThrow('You.com HTTP 500');
  });
});
