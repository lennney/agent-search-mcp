import * as cheerio from 'cheerio';

import { logger } from '../infrastructure/logger.js';
import type { EngineSearchOptions, SearchResult } from '../types.js';
import {
  createHtmlParseError,
  fetchSearchHtml,
  normalizeHtmlText,
  resolveHtmlResultUrl,
} from './html-search.js';

const BING_SEARCH_URL = 'https://www.bing.com/search';

export const bingProvider = {
  id: 'bing' as const,
  name: 'Bing',
  isFree: true,
  languages: ['en', 'zh'],
};

export async function searchBing(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL(BING_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));
    const html = await fetchSearchHtml('bing', url, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
          + 'AppleWebKit/537.36 (KHTML, like Gecko) '
          + 'Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
    });

    const results = parseBingHTML(html, limit);
    if (!hasBingSearchSurface(html) || (hasBingResultCards(html) && results.length === 0)) {
      throw createHtmlParseError('bing');
    }
    return results;
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ err: msg.slice(0, 200) }, 'Bing search failed');
    return [];
  }
}

export function parseBingHTML(html: string, limit: number = 10): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  $('#b_results li.b_algo, li.b_algo').each((_, element) => {
    if (results.length >= limit) return;

    const card = $(element);
    const titleLink = card.find('h2 a[href], a[href]').first();
    const url = resolveHtmlResultUrl(
      titleLink.attr('href') ?? '',
      BING_SEARCH_URL,
    );
    const title = normalizeHtmlText(titleLink.text());
    if (!title || !isExternalBingUrl(url) || seenUrls.has(url)) return;

    const snippet = normalizeHtmlText(
      card.find('.b_caption p, .b_snippet, p').first().text(),
    );
    seenUrls.add(url);
    results.push({
      title,
      url,
      snippet,
      source: 'bing',
      engines: ['bing'],
    });
  });

  return results;
}
function hasBingSearchSurface(html: string): boolean {
  const $ = cheerio.load(html);
  const resultContainer = $('#b_results').first();
  return $('li.b_algo').length > 0
    || (resultContainer.length > 0
      && resultContainer.children().length === 0
      && normalizeHtmlText(resultContainer.text()) === '');
}

function hasBingResultCards(html: string): boolean {
  return cheerio.load(html)('li.b_algo').length > 0;
}

function isExternalBingUrl(url: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase() !== 'bing.com'
      && !new URL(url).hostname.toLowerCase().endsWith('.bing.com');
  } catch {
    return false;
  }
}
