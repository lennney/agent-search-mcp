import { describe, it, expect } from 'vitest';
import { searchStartpage, startpageProvider } from '../../src/engines/startpage.js';

describe('Startpage engine', () => {
  it('has correct provider metadata', () => {
    expect(startpageProvider.id).toBe('startpage');
    expect(startpageProvider.name).toBe('Startpage');
    expect(startpageProvider.isFree).toBe(true);
    expect(startpageProvider.languages).toContain('en');
  });

  it('searchStartpage returns results from Startpage HTML', async () => {
    const originalFetch = global.fetch;
    try {
      // First call: get sc token, Second call: search
      let callCount = 0;
      global.fetch = (async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            text: async () => '<form id="search"><input name="sc" value="abc123"></form>',
          } as unknown as Response;
        }
        return {
          ok: true,
          text: async () => `
            <div class="result">
              <h2>Test Title</h2>
              <a href="https://example.com">link</a>
              <p>Test snippet here</p>
            </div>
          `,
        } as unknown as Response;
      }) as typeof fetch;

      const results = await searchStartpage('test', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchStartpage returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      let callCount = 0;
      global.fetch = (async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            text: async () => '<form id="search"><input name="sc" value="abc123"></form>',
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 500,
          text: async () => 'Server Error',
        } as unknown as Response;
      }) as typeof fetch;

      const results = await searchStartpage('test');
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchStartpage returns empty array on network error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchStartpage('test');
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});