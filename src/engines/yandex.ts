import * as cheerio from 'cheerio';

import { logger } from '../infrastructure/logger.js';
import type { EngineSearchOptions, SearchResult } from '../types.js';
import {
  createHtmlParseError,
  fetchSearchHtml,
  normalizeHtmlText,
  resolveHtmlResultUrl,
} from './html-search.js';
import { providerCatalog } from './provider-catalog.js';
import { profileHeaders, resolveRequestProfile } from './request-profiles.js';

const YANDEX_SEARCH_URL = 'https://yandex.com/search/';

export const yandexProvider = providerCatalog.yandex;

export async function searchYandex(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL(YANDEX_SEARCH_URL);
    url.searchParams.set('text', query);
    const profile = resolveRequestProfile(query);
    const page = await fetchSearchHtml('yandex', url, {
      signal: options?.signal,
      headers: profileHeaders(profile, {
        acceptLanguage: options?.requestContext?.acceptLanguage
          ?? 'en-US,en;q=0.9',
        referer: 'https://yandex.com/',
        kind: 'navigation',
      }),
    });

    const results = parseYandexHTML(page.html, limit);
    if (page.hasResultCards && results.length === 0) {
      throw createHtmlParseError('yandex');
    }
    return results;
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message.slice(0, 200) }, 'Yandex search failed');
    return [];
  }
}

export function parseYandexHTML(
  html: string,
  limit: number = 10,
): SearchResult[] {
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

function isExternalYandexUrl(value: string): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== 'yandex.com' && !hostname.endsWith('.yandex.com');
  } catch {
    return false;
  }
}
