import * as cheerio from 'cheerio';

import { logger } from '../infrastructure/logger.js';
import type { EngineSearchOptions, SearchResult } from '../types.js';
import {
  createHtmlParseError,
  fetchSearchHtml,
  normalizeHtmlText,
  resolveHtmlResultUrl,
} from './html-search.js';

const YANDEX_SEARCH_URL = 'https://yandex.com/search/';

export const yandexProvider = {
  id: 'yandex' as const,
  name: 'Yandex',
  isFree: true,
  languages: ['ru', 'en', 'auto'],
};

export async function searchYandex(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL(YANDEX_SEARCH_URL);
    url.searchParams.set('text', query);
    const html = await fetchSearchHtml('yandex', url, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
          + 'AppleWebKit/537.36 (KHTML, like Gecko) '
          + 'Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const results = parseYandexHTML(html, limit);
    if (!hasYandexSearchSurface(html) || (hasYandexResultCards(html) && results.length === 0)) {
      throw createHtmlParseError('yandex');
    }
    return results;
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ err: msg.slice(0, 200) }, 'Yandex search failed');
    return [];
  }
}

export function parseYandexHTML(html: string, limit: number = 10): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  $('li.serp-item, .serp-item').each((_, element) => {
    if (results.length >= limit) return;

    const card = $(element);
    const titleLink = card
      .find('h2 a[href], h3 a[href], a.organic__url[href], a[href]')
      .first();
    const url = resolveHtmlResultUrl(
      titleLink.attr('href') ?? '',
      YANDEX_SEARCH_URL,
    );
    const title = normalizeHtmlText(titleLink.text());
    if (!title || !isExternalYandexUrl(url) || seenUrls.has(url)) return;

    const snippet = normalizeHtmlText(
      card
        .find('.text-container, .OrganicTextContentSpan, .TextContainer, p')
        .first()
        .text(),
    );
    seenUrls.add(url);
    results.push({
      title,
      url,
      snippet,
      source: 'yandex',
      engines: ['yandex'],
    });
  });

  return results;
}

function hasYandexSearchSurface(html: string): boolean {
  const $ = cheerio.load(html);
  const resultContainer = $('.serp-list, #search-result').first();
  return hasYandexResultCards(html)
    || (resultContainer.length > 0
      && resultContainer.children().length === 0
      && normalizeHtmlText(resultContainer.text()) === '');
}

function hasYandexResultCards(html: string): boolean {
  return cheerio.load(html)('li.serp-item, .serp-item').length > 0;
}

function isExternalYandexUrl(url: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname !== 'yandex.com' && !hostname.endsWith('.yandex.com');
  } catch {
    return false;
  }
}
