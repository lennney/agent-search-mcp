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

  it('searchYouCom throws on HTTP 500 (server error)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(searchYouCom('test query', 5)).rejects.toThrow('You.com HTTP 500');
  });

  it('searchYouCom returns empty array when results are missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toEqual([]);
  });

  it('searchYouCom returns empty array when web and news are both null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: { web: null, news: null } }),
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toEqual([]);
  });

  it('searchYouCom filters out items without title', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          web: [
            { title: '', url: 'https://example.com/no-title', description: 'No title' },
            { title: 'Good', url: 'https://example.com/good', description: 'Has title' },
          ],
        },
      }),
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Good');
  });

  it('searchYouCom filters out items without url', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          web: [
            { title: 'No URL', url: '', description: 'No URL' },
            { title: 'Good', url: 'https://example.com/good', description: 'Has URL' },
          ],
        },
      }),
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/good');
  });

  it('searchYouCom uses snippets fallback when description is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          web: [
            {
              title: 'Snippet Only',
              url: 'https://example.com/snippet',
              description: '',
              snippets: ['This is from snippets'],
            },
          ],
        },
      }),
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe('This is from snippets');
  });

  it('searchYouCom respects count parameter', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      description: `Snippet ${i}`,
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: { web: items } }),
    });

    const results = await searchYouCom('test query', 3);
    expect(results).toHaveLength(3);
  });

  it('searchYouCom returns empty array on 4xx (client error)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toEqual([]);
  });

  it('searchYouCom returns empty array on 429 (rate limit)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
    });

    const results = await searchYouCom('test query', 5);
    expect(results).toEqual([]);
  });

  it('searchYouCom throws on 5xx (server error)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(searchYouCom('test query', 5)).rejects.toThrow('You.com HTTP 503');
  });

});
