import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchExa } from '../../src/engines/exa.js';

describe('Exa engine', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('searchExa returns results on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Test Result',
            url: 'https://example.com',
            text: 'Test snippet',
            highlights: ['Highlighted text'],
            author: 'Test Author',
          },
        ],
      }),
    });

    const results = await searchExa({
      query: 'test query',
      count: 5,
      apiKey: 'test-key',
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Result');
    expect(results[0].url).toBe('https://example.com');
    expect(results[0].engines).toContain('exa');
  });

  it('searchExa returns empty array on fetch error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const results = await searchExa({
      query: 'test query',
      count: 5,
      apiKey: 'test-key',
    });

    expect(results).toEqual([]);
  });

  it('searchExa returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const results = await searchExa({
      query: 'test query',
      count: 5,
      apiKey: 'test-key',
    });

    expect(results).toEqual([]);
  });

  it('searchExa returns empty array when no API key', async () => {
    const results = await searchExa({
      query: 'test query',
      count: 5,
    });

    expect(results).toEqual([]);
  });
});
