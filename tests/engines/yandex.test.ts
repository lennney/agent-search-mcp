import { describe, it, expect } from 'vitest';
import { searchYandex, yandexProvider } from '../../src/engines/yandex.js';

describe('Yandex engine', () => {
  it('has correct provider metadata', () => {
    expect(yandexProvider.id).toBe('yandex');
    expect(yandexProvider.name).toBe('Yandex');
    expect(yandexProvider.isFree).toBe(true);
    expect(yandexProvider.languages).toContain('ru');
    expect(yandexProvider.languages).toContain('en');
  });

  it('searchYandex returns array', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () => '<html><body>test</body></html>',
      }) as Response;

      const results = await searchYandex('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchYandex returns empty array on fetch error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await searchYandex('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('searchYandex returns empty array on HTTP error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchYandex('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});