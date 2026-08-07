import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseYandexHTML,
  searchYandex,
  yandexProvider,
} from '../../src/engines/yandex.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Yandex engine', () => {
  it('has correct provider metadata', () => {
    expect(yandexProvider.id).toBe('yandex');
    expect(yandexProvider.name).toBe('Yandex');
    expect(yandexProvider.isFree).toBe(true);
    expect(yandexProvider.languages).toEqual(expect.arrayContaining(['ru', 'en']));
  });

  it('parses DOM result cards and rejects internal result links', () => {
    const results = parseYandexHTML(`
      <ul class="serp-list">
        <li class="serp-item">
          <h2><a href="https://example.com/yandex">Yandex result</a></h2>
          <div class="text-container">A   useful Yandex snippet.</div>
        </li>
        <li class="serp-item">
          <h2><a href="https://passport.yandex.com/login">Internal</a></h2>
        </li>
      </ul>
    `, 5);

    expect(results).toEqual([{
      title: 'Yandex result',
      url: 'https://example.com/yandex',
      snippet: 'A useful Yandex snippet.',
      source: 'yandex',
      engines: ['yandex'],
    }]);
  });

  it('keeps a recognized empty search surface as an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><body><ul class="serp-list"></ul></body></html>',
      { status: 200 },
    )));

    await expect(searchYandex('no matching result', 5, { throwOnError: true }))
      .resolves.toEqual([]);
  });

  it('reports changed successful HTML instead of a successful empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><head><title>Yandex Search</title></head><body>changed</body></html>',
      { status: 200 },
    )));

    await expect(searchYandex('test query', 5, { throwOnError: true }))
      .rejects.toMatchObject({
        failureType: 'parse_error',
        retryable: false,
      });
  });

  it('reports result-card parser drift as parse_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <html><body><ul class="serp-list">
        <li class="serp-item"><div class="changed-title">No known link</div></li>
      </ul></body></html>
    `, { status: 200 })));

    await expect(searchYandex('test query', 5, { throwOnError: true }))
      .rejects.toMatchObject({ failureType: 'parse_error' });
  });

  it('soft-fails typed adapter errors for direct callers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><head><title>SmartCaptcha</title></head><body>robot check</body></html>',
      { status: 200 },
    )));

    await expect(searchYandex('test query', 5)).resolves.toEqual([]);
  });
});
