import { describe, it, expect, vi } from 'vitest';
import { searchMojeek, mojeekProvider } from '../../src/engines/mojeek.js';
import { resolveRequestProfile, currentProfileWindowKey } from '../../src/engines/request-profiles.js';

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

  it('sends the coherent request profile in the outbound request', async () => {
    const originalFetch = global.fetch;
    try {
      let capturedHeaders: Record<string, string> | undefined;
      global.fetch = vi.fn(
        async (_url: string | URL, init?: RequestInit) => {
          capturedHeaders = init?.headers as Record<string, string>;
          return {
            ok: true,
            text: async () => '<html><body>test</body></html>',
          } as Response;
        },
      );

      const query = 'profile header check';
      await searchMojeek(query, 5);
      const profile = resolveRequestProfile(query, currentProfileWindowKey());

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders!['User-Agent']).toBe(profile.userAgent);
      expect(capturedHeaders!['Accept-Encoding']).toBe(profile.acceptEncoding);
      expect(capturedHeaders!['sec-ch-ua']).toBe(
        profile.clientHints['sec-ch-ua'],
      );
      expect(capturedHeaders!['Sec-Fetch-Dest']).toBe('document');
      expect(capturedHeaders!['Accept-Language']).toBe('en-US,en;q=0.9');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('surfaces the Altcha captcha as bot_challenge under throwOnError', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () =>
          '<html><head><title>Captcha</title></head><body>'
          + 'Verification required<altcha-widget challenge="/captcha/challenge">'
          + '</altcha-widget></body></html>',
      }) as Response;

      await expect(searchMojeek('test query', 5, { throwOnError: true }))
        .rejects.toMatchObject({ failureType: 'bot_challenge' });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('soft-returns empty for a captcha when throwOnError is unset', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        text: async () =>
          '<html><head><title>Captcha</title></head><body>'
          + 'verification required</body></html>',
      }) as Response;

      const results = await searchMojeek('test query', 5);
      expect(results).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});