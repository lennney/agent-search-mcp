import * as cheerio from 'cheerio';
import { SearchResult } from '../types.js';
import { logger } from '../infrastructure/logger.js';

export const duckduckgoHtmlProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo (HTML)',
  isFree: true,
  languages: ['en'],
};

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
export async function searchDuckDuckGoHtml(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const body = new URLSearchParams({
      q: query,
      b: '',         // first-page marker (ddgs pattern)
      l: 'us-en',    // region
    });

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
      signal: AbortSignal.timeout(10000),
    });

    // DDG returns 202 for rate limits (gajae-code pattern)
    if (res.status === 202) {
      logger.warn('DDG HTML: Rate limited (HTTP 202)');
      return [];
    }

    if (!res.ok) {
      logger.warn({ status: res.status }, 'DDG HTML: HTTP error');
      return [];
    }

    const html = await res.text();
    return parseDdgHtml(html, limit);
  } catch (error) {
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
function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);

  // Detect captcha challenge page (searxng pattern)
  if ($('#challenge-form').length > 0) {
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
