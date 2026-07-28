import { describe, it, expect } from 'vitest';
import {
  parseYandexHTML,
  searchYandex,
  yandexProvider,
} from '../../src/engines/yandex.js';

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
        url: 'https://yandex.com/search/?text=test+query',
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
        url: 'https://yandex.com/search/?text=test+query',
        text: async () => 'Server Error',
      }) as Response;

      const results = await searchYandex('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('parses result cards through the public HTML parser', () => {
    const results = parseYandexHTML(`
      <html><head><title>Yandex Search</title></head><body>
        <ul class="serp-list">
          <li class="serp-item">
            <h2><a href="https://example.com/yandex">Yandex result</a></h2>
            <div class="text-container">A useful Yandex snippet.</div>
          </li>
        </ul>
      </body></html>
    `, 5);

    expect(results).toEqual([{
      title: 'Yandex result',
      url: 'https://example.com/yandex',
      snippet: 'A useful Yandex snippet.',
      source: 'yandex',
      engines: ['yandex'],
    }]);
  });

  it('classifies a verification redirect URL as a bounded challenge', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        url: 'https://yandex.com/showcaptchafast?retpath=search',
        text: async () => '<html><title>Verification</title></html>',
      }) as Response;

      await expect(searchYandex('OpenAI', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'bot_challenge',
          cooldownMs: 3_600_000,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports an unexpected 200 HTML shape instead of a successful empty result', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>Yandex Search</title></head><body>changed</body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchYandex('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'parse_error',
          retryable: false,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports known outer-container with unknown card drift as parse_error', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        `<html><body>
          <ul class="serp-list">
            <li class="new-result-card">
              <h2><a href="https://example.com/drift">Drifted result</a></h2>
            </li>
          </ul>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchYandex('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({
          failureType: 'parse_error',
          retryable: false,
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns an empty array by default for known outer-container with unknown card drift', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        `<html><body>
          <ul class="serp-list">
            <li class="new-result-card">
              <h2><a href="https://example.com/drift">Drifted result</a></h2>
            </li>
          </ul>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchYandex('test query', 5)).resolves.toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps a valid zero-result search page as an empty success', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => new Response(
        '<html><head><title>Yandex Search</title></head><body><ul class="serp-list"></ul></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );

      await expect(searchYandex('no matching result', 5, { throwOnError: true }))
        .resolves.toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
