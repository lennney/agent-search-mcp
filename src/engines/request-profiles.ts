import { createHash } from 'node:crypto';

/**
 * Coherent browser request profiles (HTTP layer only).
 *
 * Each profile bundles a User-Agent with the client hints, Accept, Accept-Encoding
 * and header order that the same real browser would send, so the request reads as
 * one identity instead of a mismatched header soup. Values mirror the header sets
 * published by curl-impersonate wrapper scripts and stealth-fetch. This module is
 * intentionally internal: the same idea already ships as `stealth-fetch`, and the
 * durable differentiator (TLS/JA3 impersonation) is a separate, deferred decision.
 *
 * TLS fingerprint stays Node's default regardless of profile — this only varies the
 * HTTP identity, which is the lever for header/UA heuristics, not TLS-aware bot
 * detection.
 */

export type ProfileHeaderKind = 'navigation' | 'script' | 'form';

export interface RequestProfile {
  readonly id: string;
  readonly userAgent: string;
  /** Chromium client hints; empty for Firefox/Safari which send none. */
  readonly clientHints: Readonly<Record<string, string>>;
  readonly acceptHtml: string;
  readonly acceptScript: string;
  readonly acceptEncoding: string;
  readonly upgradeInsecureRequests: boolean;
  /** Best-effort HTTP/1.1 header emission order for this browser. */
  readonly headerOrder: readonly string[];
}

const PROFILES: readonly RequestProfile[] = Object.freeze([
  Object.freeze({
    id: 'chrome-136-windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/136.0.0.0 Safari/537.36',
    clientHints: Object.freeze({
      'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="136", "Chromium";v="136"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    }),
    acceptHtml:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,'
      + 'image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptScript: '*/*',
    acceptEncoding: 'gzip, deflate, br, zstd',
    upgradeInsecureRequests: true,
    headerOrder: Object.freeze([
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'Upgrade-Insecure-Requests',
      'User-Agent',
      'Accept',
      'Accept-Language',
      'Sec-Fetch-Dest',
      'Sec-Fetch-Mode',
      'Sec-Fetch-Site',
      'Sec-Fetch-User',
      'Accept-Encoding',
      'Referer',
    ]),
  }),
  Object.freeze({
    id: 'chrome-120-macos',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/120.0.0.0 Safari/537.36',
    clientHints: Object.freeze({
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    }),
    acceptHtml:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,'
      + 'image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptScript: '*/*',
    acceptEncoding: 'gzip, deflate, br, zstd',
    upgradeInsecureRequests: true,
    headerOrder: Object.freeze([
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'Upgrade-Insecure-Requests',
      'User-Agent',
      'Accept',
      'Accept-Language',
      'Sec-Fetch-Dest',
      'Sec-Fetch-Mode',
      'Sec-Fetch-Site',
      'Sec-Fetch-User',
      'Accept-Encoding',
      'Referer',
    ]),
  }),
  Object.freeze({
    id: 'firefox-135',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) '
      + 'Gecko/20100101 Firefox/135.0',
    clientHints: Object.freeze({}),
    acceptHtml:
      'text/html,application/xhtml+xml,application/xml;q=0.9,'
      + 'image/avif,image/webp,*/*;q=0.8',
    acceptScript: '*/*',
    acceptEncoding: 'gzip, deflate, br, zstd',
    upgradeInsecureRequests: true,
    headerOrder: Object.freeze([
      'User-Agent',
      'Accept',
      'Accept-Language',
      'Upgrade-Insecure-Requests',
      'Sec-Fetch-Dest',
      'Sec-Fetch-Mode',
      'Sec-Fetch-Site',
      'Sec-Fetch-User',
      'Accept-Encoding',
      'Referer',
    ]),
  }),
  Object.freeze({
    id: 'safari-17',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/605.1.15 (KHTML, like Gecko) '
      + 'Version/17.4 Safari/605.1.15',
    clientHints: Object.freeze({}),
    acceptHtml: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    acceptScript: '*/*',
    acceptEncoding: 'gzip, deflate, br',
    upgradeInsecureRequests: true,
    headerOrder: Object.freeze([
      'Accept',
      'Sec-Fetch-Site',
      'Accept-Encoding',
      'Sec-Fetch-Mode',
      'User-Agent',
      'Accept-Language',
      'Sec-Fetch-Dest',
      'Sec-Fetch-User',
      'Referer',
    ]),
  }),
]);

/**
 * Deterministically pick one coherent profile for a logical query, so every
 * request of the same query (bootstrap, preload, HTML, Lite) shares one identity
 * while different queries vary. An optional `windowKey` (e.g. a coarse time
 * bucket from `currentProfileWindowKey`) rotates the identity for the same query
 * across windows while staying deterministic within one window. Keeps exact-cache
 * keys consistent because the cache is keyed by query, not by profile.
 */
export function resolveRequestProfile(
  query: string,
  windowKey?: string,
): RequestProfile {
  const key = windowKey === undefined ? query : `${query}\0${windowKey}`;
  const digest = createHash('sha256').update(key).digest();
  const index = digest.readUInt32BE(0) % PROFILES.length;
  return PROFILES[index];
}

const PROFILE_WINDOW_MS = 3_600_000;

/** Coarse time bucket so repeated queries rotate identity across windows. */
export function currentProfileWindowKey(now: number = Date.now()): string {
  return String(Math.floor(now / PROFILE_WINDOW_MS));
}

/** Default coherent identity (Chrome/136 Windows) for non-query fetches. */
export function resolveDefaultProfile(): RequestProfile {
  return PROFILES[0];
}

export interface ProfileHeaderOptions {
  readonly acceptLanguage: string;
  readonly referer: string;
  readonly kind: ProfileHeaderKind;
}

/** Compose a coherent, best-effort-ordered header set for one request context. */
export function profileHeaders(
  profile: RequestProfile,
  options: ProfileHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    ...profile.clientHints,
    'Accept': options.kind === 'script'
      ? profile.acceptScript
      : profile.acceptHtml,
    'Accept-Language': options.acceptLanguage,
    'Accept-Encoding': profile.acceptEncoding,
    'Referer': options.referer,
  };
  if (profile.upgradeInsecureRequests) {
    headers['Upgrade-Insecure-Requests'] = '1';
  }
  if (options.kind === 'script') {
    headers['Sec-Fetch-Dest'] = 'script';
    headers['Sec-Fetch-Mode'] = 'no-cors';
    headers['Sec-Fetch-Site'] = 'same-site';
  } else {
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'same-origin';
    headers['Sec-Fetch-User'] = '?1';
  }
  return orderProfileHeaders(headers, profile.headerOrder);
}

function orderProfileHeaders(
  headers: Record<string, string>,
  order: readonly string[],
): Record<string, string> {
  const ordered: Record<string, string> = {};
  for (const name of order) {
    if (name in headers) {
      ordered[name] = headers[name];
      delete headers[name];
    }
  }
  return { ...ordered, ...headers };
}
