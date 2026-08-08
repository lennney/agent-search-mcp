import { describe, expect, it } from 'vitest';

import {
  profileHeaders,
  resolveDefaultProfile,
  resolveRequestProfile,
} from '../../src/engines/request-profiles.js';

describe('resolveRequestProfile', () => {
  it('is deterministic for the same query', () => {
    expect(resolveRequestProfile('climate change policy'))
      .toBe(resolveRequestProfile('climate change policy'));
  });

  it('rotates across the coherent profile set for different queries', () => {
    const ids = new Set<string>();
    for (let index = 0; index < 64; index += 1) {
      ids.add(resolveRequestProfile(`query-${index}`).id);
    }
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });

  it('keeps Chromium client hints off Firefox and Safari profiles', () => {
    const chromium = ['chrome-136-windows', 'chrome-120-macos'];
    const nonChromium = ['firefox-135', 'safari-17'];
    for (let index = 0; index < 200; index += 1) {
      const profile = resolveRequestProfile(`coherence-${index}`);
      if (chromium.includes(profile.id)) {
        expect(profile.clientHints['sec-ch-ua']).toBeDefined();
        expect(profile.clientHints['sec-ch-ua-platform']).toBeDefined();
      } else if (nonChromium.includes(profile.id)) {
        expect(Object.keys(profile.clientHints)).toHaveLength(0);
      }
    }
  });
});

describe('resolveDefaultProfile', () => {
  it('returns a fixed coherent Chrome profile for non-query fetches', () => {
    const profile = resolveDefaultProfile();
    expect(profile.id).toBe('chrome-136-windows');
    expect(profile.userAgent).toContain('Chrome/136');
    expect(profile.clientHints['sec-ch-ua']).toBeDefined();
    expect(profile.clientHints['sec-ch-ua-platform']).toBe('"Windows"');
  });
});

describe('profileHeaders', () => {
  it('emits a coherent navigation header set in profile order', () => {
    const profile = resolveRequestProfile('navigation');
    const headers = profileHeaders(profile, {
      acceptLanguage: 'en-US,en;q=0.9',
      referer: 'https://duckduckgo.com/',
      kind: 'navigation',
    });

    expect(headers['User-Agent']).toBe(profile.userAgent);
    expect(headers['Accept']).toBe(profile.acceptHtml);
    expect(headers['Accept-Language']).toBe('en-US,en;q=0.9');
    expect(headers['Referer']).toBe('https://duckduckgo.com/');
    expect(headers['Sec-Fetch-Dest']).toBe('document');
    expect(headers['Sec-Fetch-Mode']).toBe('navigate');
    expect(headers['Sec-Fetch-User']).toBe('?1');
    expect(headers['Upgrade-Insecure-Requests']).toBe('1');

    const names = Object.keys(headers);
    const ordered = profile.headerOrder.filter(name => names.includes(name));
    expect(names.slice(0, ordered.length)).toEqual(ordered);
  });

  it('emits script context without the navigation-only hints', () => {
    const profile = resolveRequestProfile('script-context');
    const headers = profileHeaders(profile, {
      acceptLanguage: 'en-US,en;q=0.9',
      referer: 'https://duckduckgo.com/',
      kind: 'script',
    });

    expect(headers['Accept']).toBe(profile.acceptScript);
    expect(headers['Sec-Fetch-Dest']).toBe('script');
    expect(headers['Sec-Fetch-Mode']).toBe('no-cors');
    expect(headers['Sec-Fetch-User']).toBeUndefined();
  });

  it('merges Chromium client hints into the header set', () => {
    const profile = resolveRequestProfile('client-hints');
    const headers = profileHeaders(profile, {
      acceptLanguage: 'en-US,en;q=0.9',
      referer: 'https://html.duckduckgo.com/html/',
      kind: 'form',
    });

    expect(headers['sec-ch-ua']).toBeDefined();
    expect(headers['sec-ch-ua-mobile']).toBe('?0');
  });
});
