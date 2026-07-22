import * as cheerio from 'cheerio';
import { SearchResult } from '../types.js';
import { logger } from '../infrastructure/logger.js';

export const duckduckgoHtmlProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo (HTML)',
  isFree: true,
  languages: ['en'],
};

/**
 * Extract the real URL from a DuckDuckGo redirect link.
 * DDG wraps result URLs in /l/?uddg=<encoded_url> format.
 * Handles protocol-relative URLs (//duckduckgo.com/l/?uddg=...) that DDG returns.
 */
function extractRealUrl(href: string): string {
  // DDG returns protocol-relative URLs — prepend https: for URL parsing
  const normalized = href.startsWith('//') ? `https:${href}` : href;
  try {
    const url = new URL(normalized);
    if (url.pathname === '/l/' && url.searchParams.has('uddg')) {
      return url.searchParams.get('uddg') || href;
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return href;
}

/**
 * Search DuckDuckGo using direct HTML parsing (no Python dependency).
 * Fetches https://html.duckduckgo.com/html/?q=<query> and parses results with cheerio.
 */
export async function searchDuckDuckGoHtml(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

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
 * Parse DuckDuckGo HTML results using cheerio.
 */
function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
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
