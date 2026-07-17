import { describe, it, expect } from 'vitest';
import { searchMojeek, mojeekProvider } from '../../src/engines/mojeek.js';

describe('Mojeek engine', () => {
  it('has correct provider metadata', () => {
    expect(mojeekProvider.id).toBe('mojeek');
    expect(mojeekProvider.name).toBe('Mojeek');
    expect(mojeekProvider.isFree).toBe(true);
    expect(mojeekProvider.languages).toContain('en');
  });

  it('searchMojeek returns array', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () => '<html><body>test</body></html>',
      }) as Response;

      const results = await searchMojeek('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchMojeek returns empty array on fetch error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchMojeek('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchMojeek returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchMojeek('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});