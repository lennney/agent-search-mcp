import * as cheerio from 'cheerio';

import { withTimeout } from '../infrastructure/abort.js';
import {
  EngineAdapterError,
  isEngineAdapterError,
} from './engine-error.js';

export type HtmlSearchEngine = 'bing' | 'yandex';

export interface HtmlSearchFetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
}

export interface HtmlSearchPage {
  html: string;
  hasResultCards: boolean;
}

interface SearchSurfaceDefinition {
  containerSelector: string;
  resultSelector: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

const SEARCH_SURFACES: Record<HtmlSearchEngine, SearchSurfaceDefinition> = {
  bing: {
    containerSelector: '#b_results',
    resultSelector: '#b_results li.b_algo, li.b_algo',
  },
  yandex: {
    containerSelector: '.serp-list, #search-result',
    resultSelector: 'li.serp-item, .serp-item',
  },
};

const TITLE_CHALLENGE_MARKERS = [
  'captcha',
  'verify you are human',
  'unusual traffic',
  'access denied',
  'please confirm that you are not a robot',
  'robot check',
  'smartcaptcha',
  'security verification',
  '安全验证',
  '验证码',
  '访问异常',
  'я не робот',
  'проверка безопасности',
];

const BODY_CHALLENGE_MARKERS = [
  'captcha',
  'altcha-widget',
  'captcha-note',
  'verify you are human',
  'unusual traffic',
  'access denied',
  'please solve the captcha',
  'please enter the captcha',
  'robot check',
  'smartcaptcha',
  'checking your browser before redirecting',
  'security verification',
  '安全验证',
  '验证码',
  '访问异常',
  'я не робот',
  'проверка безопасности',
];

/**
 * Fetch and validate one HTML search response.
 *
 * Provider adapters own request parameters and result parsing. This module
 * owns the shared timeout, HTTP, challenge, and recognizable-page contract.
 */
export async function fetchSearchHtml(
  engine: HtmlSearchEngine,
  input: string | URL,
  options: HtmlSearchFetchOptions = {},
): Promise<HtmlSearchPage> {
  options.signal?.throwIfAborted();
  try {
    const response = await fetch(input, {
      headers: options.headers,
      signal: withTimeout(
        options.signal,
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ),
    });
    const html = await response.text();
    const surface = inspectSearchSurface(engine, html);

    if (
      looksLikeBotChallengeUrl(response.url)
      || (!surface.recognized && looksLikeBotChallenge(html))
    ) {
      throw createBotChallenge(engine);
    }
    if (!response.ok) {
      throw createHttpError(engine, response);
    }
    if (!surface.recognized) {
      throw createHtmlParseError(engine);
    }

    return {
      html,
      hasResultCards: surface.hasResultCards,
    };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (isEngineAdapterError(error)) throw error;

    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new EngineAdapterError(
        'timeout',
        `${engine} request timed out`,
        {
          retryable: true,
          suggestion: 'Retry within the shared request budget or use another provider',
          cause: error,
        },
      );
    }
    throw new EngineAdapterError(
      'unknown',
      `${engine} request failed`,
      {
        retryable: true,
        suggestion: 'Check connectivity or use another provider',
        cause: error,
      },
    );
  }
}

export function createHtmlParseError(
  engine: HtmlSearchEngine,
): EngineAdapterError {
  return new EngineAdapterError(
    'parse_error',
    `${engine} returned HTML without a recognized search result surface`,
    {
      retryable: false,
      suggestion: 'Use another provider while the response parser is checked',
    },
  );
}

export function normalizeHtmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function resolveHtmlResultUrl(
  rawUrl: string,
  baseUrl: string | URL,
): string {
  if (!rawUrl.trim()) return '';
  try {
    const url = new URL(rawUrl, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function inspectSearchSurface(
  engine: HtmlSearchEngine,
  html: string,
): { recognized: boolean; hasResultCards: boolean } {
  const $ = cheerio.load(html);
  const definition = SEARCH_SURFACES[engine];
  const hasResultCards = $(definition.resultSelector).length > 0;
  if (hasResultCards) return { recognized: true, hasResultCards: true };

  const container = $(definition.containerSelector).first();
  const isRecognizedEmptySurface = container.length > 0
    && container.children().length === 0
    && normalizeHtmlText(container.text()) === '';
  return {
    recognized: isRecognizedEmptySurface,
    hasResultCards: false,
  };
}

function looksLikeBotChallenge(html: string): boolean {
  const $ = cheerio.load(html);
  const titleAndMeta = normalizeHtmlText([
    $('title').first().text(),
    $('meta[name="description"]').first().attr('content') ?? '',
  ].join(' ')).toLowerCase();
  const body = $('body').first();
  body.find('script, style, noscript').remove();
  const visibleBodyText = normalizeHtmlText(body.text()).toLowerCase();

  return TITLE_CHALLENGE_MARKERS.some(marker => titleAndMeta.includes(marker))
    || BODY_CHALLENGE_MARKERS.some(marker => visibleBodyText.includes(marker));
}

function looksLikeBotChallengeUrl(value: string): boolean {
  if (!value) return false;
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return pathname.includes('/showcaptcha')
      || pathname.includes('/captcha')
      || pathname.includes('/verification');
  } catch {
    return false;
  }
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
): EngineAdapterError {
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
      suggestion: 'Check the request configuration or use another provider',
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
