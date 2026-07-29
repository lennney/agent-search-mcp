import * as cheerio from 'cheerio';

import { withTimeout } from '../infrastructure/abort.js';
import {
  fetchForEngine,
  type ProxyAwareEngine,
} from '../infrastructure/engine-http.js';
import { EngineAdapterError } from './engine-error.js';

export type HtmlSearchEngine = Extract<
  ProxyAwareEngine,
  'bing' | 'baidu' | 'yandex'
>;

export interface HtmlSearchFetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const TITLE_CHALLENGE_MARKERS = [
  'captcha',
  'verify you are human',
  'unusual traffic',
  'access denied',
  'please confirm that you are not a robot',
  'are you not a robot',
  'robot check',
  'smartcaptcha',
  'security verification',
  '安全验证',
  '验证码',
  '访问异常',
  '请输入验证码',
  '反爬',
  'я не робот',
  'проверка безопасности',
];
const BODY_CHALLENGE_MARKERS = [
  'captcha',
  'verify you are human',
  'unusual traffic',
  'access denied: verify',
  'access denied',
  'please solve the captcha',
  'please enter the captcha',
  'captcha challenge',
  'robot check',
  'smartcaptcha',
  'checking your browser before redirecting',
  'security verification',
  '安全验证',
  '验证码',
  '访问异常',
  '请输入验证码',
  '反爬',
  'я не робот',
  'проверка безопасности',
];
const STANDALONE_CHALLENGE_MARKERS = [
  'captcha',
  'access denied',
  'smartcaptcha',
  'security verification',
  '安全验证',
  '验证码',
  '访问异常',
  '请输入验证码',
  '反爬',
  'я не робот',
  'проверка безопасности',
];
const SEARCH_SURFACE_SELECTORS: Record<HtmlSearchEngine, string> = {
  bing: '#b_results, li.b_algo',
  baidu: '#content_left, .c-container, .result',
  yandex: '.serp-list, #search-result, .serp-item',
};

/** Fetch an HTML search page through the shared, explicitly configured transport. */
export async function fetchSearchHtml(
  engine: HtmlSearchEngine,
  input: string | URL,
  options: HtmlSearchFetchOptions = {},
): Promise<string> {
  const response = await fetchForEngine(engine, input, {
    headers: options.headers,
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const html = await response.text();

  if (looksLikeBotChallenge(engine, html) || looksLikeBotChallengeUrl(response.url)) {
    throw createBotChallenge(engine);
  }
  if (!response.ok) {
    throw createHttpError(engine, response, html);
  }
  return html;
}

/** Create a stable adapter error when a successful page has no known search surface. */
export function createHtmlParseError(engine: HtmlSearchEngine): EngineAdapterError {
  return new EngineAdapterError(
    'parse_error',
    `${engine} returned HTML without a recognized search result surface`,
    {
      retryable: false,
      suggestion: 'Use another provider while the response parser is checked',
    },
  );
}

/** Normalize DOM text without changing the result content semantics. */
export function normalizeHtmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Resolve a result link while rejecting non-web URLs. */
export function resolveHtmlResultUrl(rawUrl: string, baseUrl: string | URL): string {
  if (!rawUrl.trim()) return '';
  try {
    const url = new URL(rawUrl, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

/** Detect common anti-bot interstitials without treating result snippets as challenges. */
function looksLikeBotChallenge(engine: HtmlSearchEngine, html: string): boolean {
  const $ = cheerio.load(html);
  const title = normalizeHtmlText($('title').first().text());
  const metaDescription = normalizeHtmlText(
    $('meta[name="description"]').first().attr('content') ?? '',
  );
  const body = $('body').first();
  body.find('script, style, noscript').remove();
  const visibleBodyText = normalizeHtmlText(body.text()).toLowerCase();
  const hasKnownSearchSurface = $(SEARCH_SURFACE_SELECTORS[engine]).length > 0;
  const titleAndMeta = `${title} ${metaDescription}`.toLowerCase();
  if (!hasKnownSearchSurface
    && TITLE_CHALLENGE_MARKERS.some(marker => titleAndMeta.includes(marker))) {
    return true;
  }
  if (!hasKnownSearchSurface
    && BODY_CHALLENGE_MARKERS.some(marker => visibleBodyText.includes(marker))) {
    return true;
  }

  return !hasKnownSearchSurface
    && visibleBodyText.length <= 160
    && STANDALONE_CHALLENGE_MARKERS.some(marker => visibleBodyText === marker);
}

function looksLikeBotChallengeUrl(url: string): boolean {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return normalized.includes('/showcaptcha')
    || normalized.includes('/captcha')
    || normalized.includes('/verification');
}

function createBotChallenge(engine: HtmlSearchEngine): EngineAdapterError {
  return new EngineAdapterError(
    'bot_challenge',
    `${engine} returned an anti-bot challenge`,
    {
      retryable: false,
      cooldownMs: CHALLENGE_COOLDOWN_MS,
      suggestion: 'Wait for the provider cooldown or use another network exit',
    },
  );
}

function createHttpError(
  engine: HtmlSearchEngine,
  response: Response,
  html: string,
): EngineAdapterError {
  if (looksLikeBotChallenge(engine, html)) return createBotChallenge(engine);

  if (response.status === 429) {
    return new EngineAdapterError(
      'rate_limited',
      `${engine} rate limit reached`,
      {
        retryable: false,
        cooldownMs: parseRetryAfter(response),
        suggestion: 'Use another provider or retry after the cooldown expires',
      },
    );
  }
  if (response.status === 408 || response.status === 425) {
    return new EngineAdapterError(
      'timeout',
      `${engine} returned transient HTTP ${response.status}`,
      {
        retryable: true,
        suggestion: 'Retry within the shared request budget or use another provider',
      },
    );
  }
  if (response.status >= 500) {
    return new EngineAdapterError(
      'upstream_5xx',
      `${engine} returned HTTP ${response.status}`,
      {
        retryable: response.status !== 501,
        suggestion: 'Use another provider or retry later',
      },
    );
  }
  return new EngineAdapterError(
    'upstream_4xx',
    `${engine} returned HTTP ${response.status}`,
    {
      retryable: false,
      suggestion: 'Use an explicit provider proxy or another provider',
    },
  );
}

function parseRetryAfter(response: Response): number {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (!retryAfter) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      Math.max(Math.ceil(seconds * 1_000), 1_000),
      MAX_RATE_LIMIT_COOLDOWN_MS,
    );
  }

  const retryAt = Date.parse(retryAfter);
  if (!Number.isFinite(retryAt)) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  return Math.min(
    Math.max(retryAt - Date.now(), 1_000),
    MAX_RATE_LIMIT_COOLDOWN_MS,
  );
}
