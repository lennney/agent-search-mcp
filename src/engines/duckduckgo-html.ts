import * as cheerio from 'cheerio';
import { SearchResult, type EngineSearchOptions } from '../types.js';
import { logger } from '../infrastructure/logger.js';
import { withTimeout } from '../infrastructure/abort.js';

export const duckduckgoHtmlProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo (HTML)',
  isFree: true,
  languages: ['en'],
};

export class DuckDuckGoFallbackError extends Error {
  readonly retryable = false;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'DuckDuckGoFallbackError';
  }
}

// Rotating User-Agents to avoid detection (pattern from ddgs/gajae-code)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extract the real URL from a DuckDuckGo redirect link.
 * DDG wraps result URLs in /l/?uddg=<encoded_url> format (protocol-relative).
 * Also filters out ad redirects (duckduckgo.com/y.js) and non-http URLs.
 * Pattern adapted from gajae-code + ddgs post_extract_results.
 */
function extractRealUrl(href: string): string | null {
  // DDG returns protocol-relative URLs — prepend https: for URL parsing
  const normalized = href.startsWith('//') ? `https:${href}` : href;
  try {
    const url = new URL(normalized);

    // Decode uddg redirect if present
    if (url.pathname === '/l/' && url.searchParams.has('uddg')) {
      const uddg = url.searchParams.get('uddg');
      if (!uddg) return null;
      try {
        const target = new URL(uddg);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
        if (target.hostname.endsWith('duckduckgo.com')) return null;
        return target.toString();
      } catch {
        return null;
      }
    }

    // Direct URL — reject DDG-internal links (ads, tracking)
    if (url.hostname.endsWith('duckduckgo.com')) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Search DuckDuckGo using direct HTML parsing (no Python dependency).
 * Uses POST to https://html.duckduckgo.com/html/ (matches DDG's own form + ddgs).
 */
export async function searchDuckDuckGoHtml(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const body = new URLSearchParams({
      q: query,
      b: '',         // first-page marker (ddgs pattern)
      l: 'us-en',    // region
    });
    const signal = withTimeout(options?.signal, 10000);

    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent': randomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://html.duckduckgo.com/html/',
      },
      body: body.toString(),
      signal,
    });

    // DDG returns 202 for rate limits (gajae-code pattern)
    if (res.status === 202) {
      logger.warn('DDG HTML: Rate limited (HTTP 202), trying the Lite representation once');
      signal.throwIfAborted();
      try {
        const results = await searchDuckDuckGoLiteHtml(query, limit, {
          ...options,
          signal,
        });
        logger.info(
          {
            primaryAttempt: 'http_202',
            fallbackAttempt: results.length > 0 ? 'results' : 'empty',
            count: results.length,
          },
          'DDG same-provider fallback completed',
        );
        return results;
      } catch (error) {
        options?.signal?.throwIfAborted();
        const fallbackMessage = error instanceof Error ? error.message : String(error);
        throw new DuckDuckGoFallbackError(
          `DuckDuckGo fallback failed: HTML HTTP 202 rate limit; Lite: ${fallbackMessage}`,
          error,
        );
      }
    }

    if (!res.ok) {
      if (options?.throwOnError) throw new Error(`DuckDuckGo HTTP ${res.status}`);
      logger.warn({ status: res.status }, 'DDG HTML: HTTP error');
      return [];
    }

    const html = await res.text();
    return parseDdgHtml(html, limit, options?.throwOnError === true);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout')) {
      logger.warn('DDG HTML: Search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG HTML search failed');
    }
    return [];
  }
}

/**
 * Search DuckDuckGo using its low-bandwidth Lite endpoint.
 * This is one opportunistic alternate representation of the same provider.
 * It must not count as an independent source or as a rate-limit bypass.
 */
export async function searchDuckDuckGoLiteHtml(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const body = new URLSearchParams({
      q: query,
      b: '',
      l: 'us-en',
    });

    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': randomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://lite.duckduckgo.com/lite/',
      },
      body: body.toString(),
      signal: withTimeout(options?.signal, 10000),
    });

    if (res.status === 202) {
      if (options?.throwOnError) throw new Error('DuckDuckGo Lite HTTP 202 rate limit');
      logger.warn('DDG Lite: Rate limited (HTTP 202)');
      return [];
    }

    if (!res.ok) {
      if (options?.throwOnError) throw new Error(`DuckDuckGo Lite HTTP ${res.status}`);
      logger.warn({ status: res.status }, 'DDG Lite: HTTP error');
      return [];
    }

    const html = await res.text();
    return parseDdgLiteHtml(html, limit, options?.throwOnError === true);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout')) {
      logger.warn('DDG Lite: Search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG Lite search failed');
    }
    return [];
  }
}

/**
 * Search DuckDuckGo News using HTML parsing (no Python dependency).
 * Uses the same HTML endpoint as web search — DDG News has no dedicated
 * HTML endpoint, so we delegate to the web HTML parser and relabel results.
 *
 * This is the fallback for searchDuckduckgoNews() when Python/ddgs is
 * unavailable, preventing silent empty results.
 */
export async function searchDuckDuckGoNewsHtml(query: string, limit: number = 10): Promise<SearchResult[]> {
  const results = await searchDuckDuckGoHtml(query, limit);
  // Relabel source to distinguish from regular web search results
  return results.map(r => ({
    ...r,
    source: 'duckduckgo-news',
  }));
}
function parseDdgHtml(
  html: string,
  limit: number,
  throwOnChallenge = false,
): SearchResult[] {
  const $ = cheerio.load(html);

  // Detect captcha challenge page (searxng pattern)
  if ($('#challenge-form').length > 0) {
    if (throwOnChallenge) throw new Error('DuckDuckGo captcha challenge');
    logger.warn('DDG HTML: Captcha challenge detected, results will be empty');
    return [];
  }

  const results: SearchResult[] = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return false;

    const $el = $(el);

    // Skip sponsored results (DDG marks ads with class "result--ad")
    if ($el.hasClass('result--ad')) return;

    const titleLink = $el.find('.result__a').first();
    const rawUrl = titleLink.attr('href') || '';
    const title = titleLink.text().trim();

    // Skip results without title or URL
    if (!title || !rawUrl) return;

    const url = extractRealUrl(rawUrl);

    // Skip if URL extraction failed (ads, internal links, invalid URLs)
    if (!url) return;

    const snippet = $el.find('.result__snippet').first().text().trim();

    results.push({
      title,
      url,
      snippet,
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    });
  });

  return results;
}

function parseDdgLiteHtml(
  html: string,
  limit: number,
  throwOnChallenge = false,
): SearchResult[] {
  const $ = cheerio.load(html);

  if ($('#challenge-form').length > 0) {
    if (throwOnChallenge) throw new Error('DuckDuckGo Lite captcha challenge');
    logger.warn('DDG Lite: Captcha challenge detected, results will be empty');
    return [];
  }

  const results: SearchResult[] = [];

  $('.result-link').each((_, el) => {
    if (results.length >= limit) return false;

    const $el = $(el);
    const titleRow = $el.closest('tr');
    let sponsored =
      $el.closest('.result-sponsored').length > 0
      || titleRow.hasClass('result-sponsored')
      || titleRow.find('.result-sponsored').length > 0;
    const titleLink = $el.is('a') ? $el : $el.find('a').first();
    const rawUrl = titleLink.attr('href') || '';
    const title = titleLink.text().trim();
    if (!title || !rawUrl) return;

    const url = extractRealUrl(rawUrl);
    if (!url) return;

    // Lite uses a table layout. Pair the snippet with this result's following
    // rows instead of matching two global arrays by index: ads and malformed
    // rows otherwise shift every later snippet.
    let snippet = '';
    let row = titleRow.next();
    while (row.length > 0 && row.find('.result-link').length === 0) {
      if (
        row.hasClass('result-sponsored')
        || row.find('.result-sponsored').length > 0
      ) {
        sponsored = true;
      }
      const candidate = row.find('.result-snippet').first();
      if (candidate.length > 0) {
        snippet = candidate.text().trim();
        break;
      }
      row = row.next();
    }

    if (sponsored) return;

    results.push({
      title,
      url,
      snippet,
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    });
  });

  return results;
}
