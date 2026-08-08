import * as cheerio from 'cheerio';

import { withTimeout } from '../infrastructure/abort.js';
import { fetchForEngine } from '../infrastructure/engine-http.js';
import { logger } from '../infrastructure/logger.js';
import type { EngineSearchOptions, SearchResult } from '../types.js';
import { EngineAdapterError } from './engine-error.js';
import { providerCatalog } from './provider-catalog.js';
import { profileHeaders, resolveRequestProfile } from './request-profiles.js';

const SOGOU_ORIGIN = 'https://www.sogou.com';
const SOGOU_SEARCH_URL = `${SOGOU_ORIGIN}/web`;
const MAX_REDIRECTS = 5;
const CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;
// Sogou's antispider challenge is a 403 (plus a 302 -> /antispider redirect,
// which stays outside the status-based rotation set). Rotate exits once on the
// status before conceding to the provider cooldown.
const SOGOU_ROTATE_STATUS = Object.freeze([403, 429] as const);
const MAX_STATUS_ROTATIONS = 1;

export const sogouProvider = providerCatalog.sogou;

export function parseSogouHtml(html: string): SearchResult[] {
  if (looksLikeChallengePage(html)) throw sogouChallenge();

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();
  const selectors = [
    '#main .vrwrap:not(.special-wrap)',
    '#main .rb',
    '#main .result',
    '#results .vrwrap:not(.special-wrap)',
    '.results .vrwrap:not(.special-wrap)',
    '.results .rb',
  ].join(',');

  $(selectors).each((_, element) => {
    const card = $(element);
    const titleLink = card
      .find('h3 a[href], h2 a[href], .vr-title a[href], .pt a[href]')
      .first();
    const url = resolveResultUrl(
      titleLink.attr('href') ?? '',
      titleLink.attr('data-url')
        ?? card.find('[data-url]').first().attr('data-url')
        ?? '',
    );
    const title = normalizeText(titleLink.text());
    if (!title || !url || seenUrls.has(url)) return;

    const snippet = normalizeText(
      card
        .find('.str_info, .ft, .text-layout, .fz-mid, .attribute-centent, p')
        .first()
        .text(),
    );
    const sourceText = normalizeText(
      card.find('cite, .citeurl, .g, .url').first().text(),
    );
    seenUrls.add(url);
    results.push({
      title,
      url,
      snippet,
      source: sourceText || new URL(url).hostname,
      engines: ['sogou'],
    });
  });

  return results;
}

export async function searchSogou(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL(SOGOU_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('ie', 'utf8');
    const html = await fetchSogouHtml(url, options?.signal);
    return parseSogouHtml(html).slice(0, limit);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'Sogou search failed',
    );
    return [];
  }
}

async function fetchSogouHtml(
  initialUrl: URL,
  callerSignal?: AbortSignal,
): Promise<string> {
  let currentUrl = initialUrl;
  const cookies = new Map<string, string>();
  const signal = withTimeout(callerSignal, 10_000);
  const profile = resolveRequestProfile(
    initialUrl.searchParams.get('query') ?? '',
  );

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    signal.throwIfAborted();
    const response = await fetchForEngine('sogou', currentUrl, {
      method: 'GET',
      headers: {
        ...profileHeaders(profile, {
          acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
          referer: `${SOGOU_ORIGIN}/`,
          kind: 'navigation',
        }),
        ...(cookies.size > 0 ? { 'Cookie': serializeCookies(cookies) } : {}),
      },
      redirect: 'manual',
      signal,
    }, {
      affinityKey: initialUrl.searchParams.get('query') ?? '',
      rotateOnStatus: SOGOU_ROTATE_STATUS,
      maxStatusRotations: MAX_STATUS_ROTATIONS,
    });
    mergeResponseCookies(cookies, response.headers);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new EngineAdapterError(
          'upstream_4xx',
          `Sogou returned HTTP ${response.status} without a redirect target`,
          {
            retryable: false,
            suggestion: 'Use another engine while the Sogou endpoint is checked',
          },
        );
      }
      const nextUrl = new URL(location, currentUrl);
      if (isSogouChallengeUrl(nextUrl)) throw sogouChallenge();
      if (!isAllowedSogouUrl(nextUrl)) {
        throw new EngineAdapterError(
          'upstream_4xx',
          'Sogou redirected outside its trusted origin boundary',
          {
            retryable: false,
            suggestion: 'Use another engine while the Sogou redirect is checked',
          },
        );
      }
      currentUrl = nextUrl;
      continue;
    }

    const html = await response.text();
    if (response.status === 403 || looksLikeChallengePage(html)) {
      throw sogouChallenge();
    }
    if (!response.ok) {
      const serverFailure = response.status >= 500;
      throw new EngineAdapterError(
        serverFailure ? 'upstream_5xx' : 'upstream_4xx',
        `Sogou returned HTTP ${response.status}`,
        {
          retryable: serverFailure,
          suggestion: serverFailure
            ? 'Retry later or use another engine'
            : 'Use another engine while the Sogou endpoint is unavailable',
        },
      );
    }
    return html;
  }

  throw new EngineAdapterError(
    'upstream_4xx',
    `Sogou exceeded ${MAX_REDIRECTS} redirects`,
    {
      retryable: false,
      suggestion: 'Use another engine while the Sogou redirect chain is checked',
    },
  );
}

function sogouChallenge(): EngineAdapterError {
  return new EngineAdapterError(
    'bot_challenge',
    'Sogou returned an anti-bot challenge',
    {
      retryable: false,
      cooldownMs: CHALLENGE_COOLDOWN_MS,
      suggestion: 'Wait for the provider cooldown or use another network runner',
    },
  );
}

function looksLikeChallengePage(html: string): boolean {
  const normalized = html.toLowerCase();
  if (normalized.includes('antispider')
    || normalized.includes('请输入验证码')
    || normalized.includes('访问过于频繁')) {
    return true;
  }
  return cheerio.load(html)('title')
    .first()
    .text()
    .includes('搜狗搜索验证');
}

function resolveResultUrl(rawUrl: string, dataUrl: string): string {
  for (const candidate of [dataUrl, rawUrl]) {
    if (!candidate.trim()) continue;
    try {
      const url = new URL(candidate, SOGOU_SEARCH_URL);
      const wrappedTarget = url.searchParams.get('url')
        ?? url.searchParams.get('u')
        ?? url.searchParams.get('link');
      if (wrappedTarget) {
        const target = new URL(wrappedTarget);
        if (['http:', 'https:'].includes(target.protocol)) {
          return target.toString();
        }
      }
      if (['http:', 'https:'].includes(url.protocol)) return url.toString();
    } catch {
      continue;
    }
  }
  return '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isAllowedSogouUrl(url: URL): boolean {
  return url.protocol === 'https:'
    && url.hostname.toLowerCase() === 'www.sogou.com'
    && url.username === ''
    && url.password === '';
}

function isSogouChallengeUrl(url: URL): boolean {
  return url.hostname.toLowerCase() === 'www.sogou.com'
    && url.pathname.startsWith('/antispider')
    && url.username === ''
    && url.password === '';
}

function mergeResponseCookies(
  cookies: Map<string, string>,
  headers: Headers,
): void {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitCombinedSetCookie(headers.get('set-cookie'));
  for (const value of values) {
    const pair = value.split(';', 1)[0]?.trim();
    const separator = pair?.indexOf('=') ?? -1;
    if (!pair || separator <= 0) continue;
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function splitCombinedSetCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
}

function serializeCookies(cookies: Map<string, string>): string {
  return [...cookies]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
