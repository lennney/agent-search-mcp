import * as cheerio from 'cheerio';

import { withTimeout } from '../infrastructure/abort.js';
import { fetchForEngine } from '../infrastructure/engine-http.js';
import { logger } from '../infrastructure/logger.js';
import type { EngineSearchOptions, SearchResult } from '../types.js';
import { EngineAdapterError } from './engine-error.js';

const DDG_HOME_ORIGIN = 'https://duckduckgo.com';
const DDG_PRELOAD_ORIGIN = 'https://links.duckduckgo.com';
const MAX_DDG_QUERY_CHARS = 499;
const MAX_RESPONSE_CHARS = 2_000_000;
const CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;

// DDG binds its signed preload URL to the request identity. Keep this stable
// for both steps instead of rotating identities inside one logical session.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/136.0.0.0 Safari/537.36';

type DdgApiResult = {
  t?: unknown;
  u?: unknown;
  a?: unknown;
  n?: unknown;
};

export async function searchDuckDuckGoWeb(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    if (query.length > MAX_DDG_QUERY_CHARS) {
      throw new EngineAdapterError(
        'validation_error',
        `DuckDuckGo queries must not exceed ${MAX_DDG_QUERY_CHARS} characters`,
        {
          retryable: false,
          suggestion: 'Shorten the query before retrying',
        },
      );
    }
    options?.signal?.throwIfAborted();
    const signal = withTimeout(options?.signal, 10_000);
    const homeUrl = new URL('/', DDG_HOME_ORIGIN);
    homeUrl.searchParams.set('q', query);
    homeUrl.searchParams.set('t', 'h_');
    homeUrl.searchParams.set('ia', 'web');

    const homeResponse = await fetchForEngine('duckduckgo', homeUrl, {
      method: 'GET',
      headers: navigationHeaders(),
      redirect: 'error',
      signal,
    });
    const homeHtml = await readBoundedText(homeResponse);
    ensureUsableResponse('Web bootstrap', homeResponse, homeHtml);
    signal.throwIfAborted();
    options?.signal?.throwIfAborted();

    const preloadUrl = extractPreloadUrl(homeHtml);
    const apiResponse = await fetchForEngine(
      'duckduckgo',
      buildJsonApiUrl(preloadUrl),
      {
      method: 'GET',
      headers: scriptHeaders(),
      redirect: 'error',
      signal,
      },
    );
    const apiBody = await readBoundedText(apiResponse);
    ensureUsableResponse('Web API', apiResponse, apiBody);

    let payload: unknown;
    try {
      payload = JSON.parse(apiBody);
    } catch (error) {
      throw new EngineAdapterError(
        'parse_error',
        'DuckDuckGo Web API returned malformed JSON',
        {
          retryable: false,
          suggestion: 'Use another engine while the DDG response contract is checked',
          cause: error,
        },
      );
    }

    return parseApiResults(payload, limit);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'DDG Web representation failed',
    );
    return [];
  }
}

function navigationHeaders(): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${DDG_HOME_ORIGIN}/`,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

function scriptHeaders(): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${DDG_HOME_ORIGIN}/`,
    'Sec-Fetch-Dest': 'script',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-site',
  };
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_CHARS) {
    throw new EngineAdapterError(
      'unknown',
      'DuckDuckGo response exceeded the safe size limit',
      {
        retryable: false,
        suggestion: 'Use another engine while the upstream response is checked',
      },
    );
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new EngineAdapterError(
      'unknown',
      'DuckDuckGo response exceeded the safe size limit',
      {
        retryable: false,
        suggestion: 'Use another engine while the upstream response is checked',
      },
    );
  }
  return text;
}

function ensureUsableResponse(
  stage: string,
  response: Response,
  body: string,
): void {
  if (response.status === 202 || looksLikeChallenge(body)) {
    throw new EngineAdapterError(
      'bot_challenge',
      `DuckDuckGo ${stage} returned an anti-bot challenge`,
      {
        retryable: false,
        cooldownMs: CHALLENGE_COOLDOWN_MS,
        suggestion: 'Wait for the provider cooldown or use another network runner',
      },
    );
  }
  if (response.ok) return;

  const isServerFailure = response.status >= 500;
  throw new EngineAdapterError(
    isServerFailure ? 'upstream_5xx' : 'upstream_4xx',
    `DuckDuckGo ${stage} returned HTTP ${response.status}`,
    {
      retryable: isServerFailure,
      suggestion: isServerFailure
        ? 'Retry later or use another engine'
        : 'Use another engine while the DDG endpoint is unavailable',
    },
  );
}

function looksLikeChallenge(body: string): boolean {
  const normalized = body.toLowerCase();
  return normalized.includes('challenge-form')
    || normalized.includes('anomaly-modal')
    || normalized.includes('captcha');
}

function extractPreloadUrl(html: string): URL {
  const $ = cheerio.load(html);
  const href = $('#deep_preload_link').attr('href')
    ?? $('link[rel="preload"][as="script"]').attr('href')
    ?? $('#deep_preload_script').attr('src');
  if (!href) {
    throw new EngineAdapterError(
      'unknown',
      'DuckDuckGo Web bootstrap did not contain a preload URL',
      {
        retryable: false,
        suggestion: 'Use another engine while the DDG page contract is checked',
      },
    );
  }

  let url: URL;
  try {
    url = new URL(href, `${DDG_HOME_ORIGIN}/`);
  } catch (error) {
    throw new EngineAdapterError(
      'unknown',
      'DuckDuckGo Web bootstrap returned an invalid preload URL',
      {
        retryable: false,
        suggestion: 'Use another engine while the DDG page contract is checked',
        cause: error,
      },
    );
  }
  if (url.origin !== DDG_PRELOAD_ORIGIN
    || url.pathname !== '/d.js'
    || url.username !== ''
    || url.password !== '') {
    throw new EngineAdapterError(
      'unknown',
      'DuckDuckGo Web bootstrap returned an untrusted preload URL',
      {
        retryable: false,
        suggestion: 'Use another engine while the DDG page contract is checked',
      },
    );
  }
  return url;
}

function buildJsonApiUrl(preloadUrl: URL): string {
  const href = preloadUrl.toString();
  return href.includes('/d.js?')
    ? href.replace('/d.js?', '/d.js?o=json&')
    : `${href}?o=json`;
}

function parseApiResults(payload: unknown, limit: number): SearchResult[] {
  if (typeof payload !== 'object' || payload === null
    || !Array.isArray((payload as { results?: unknown }).results)) {
    throw new EngineAdapterError(
      'unknown',
      'DuckDuckGo Web API response did not contain a result array',
      {
        retryable: false,
        suggestion: 'Use another engine while the DDG response contract is checked',
      },
    );
  }

  const results: SearchResult[] = [];
  for (const row of (payload as { results: DdgApiResult[] }).results) {
    if (results.length >= limit || typeof row?.u !== 'string') continue;
    const url = externalResultUrl(row.u);
    const title = typeof row.t === 'string' ? plainText(row.t) : '';
    if (!url || !title) continue;
    results.push({
      title,
      url,
      snippet: typeof row.a === 'string' ? plainText(row.a) : '',
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    });
  }
  return results;
}

function externalResultUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.hostname === 'duckduckgo.com'
      || url.hostname.endsWith('.duckduckgo.com')) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function plainText(value: string): string {
  return cheerio.load(value).text().replace(/\s+/g, ' ').trim();
}
