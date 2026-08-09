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
import { profileHeaders, resolveRequestProfile, currentProfileWindowKey } from './request-profiles.js';

const BING_SEARCH_URL = 'https://www.bing.com/search';

export const bingProvider = providerCatalog.bing;

export async function searchBing(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL(BING_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));
    const profile = resolveRequestProfile(query, currentProfileWindowKey());
    const page = await fetchSearchHtml('bing', url, {
      signal: options?.signal,
      headers: profileHeaders(profile, {
        acceptLanguage: options?.requestContext?.acceptLanguage
          ?? 'en-US,en;q=0.9,zh-CN;q=0.8',
        referer: 'https://www.bing.com/',
        kind: 'navigation',
      }),
    });

    const results = parseBingHTML(page.html, limit);
    if (page.hasResultCards && results.length === 0) {
      throw createHtmlParseError('bing');
    }
    return results;
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message.slice(0, 200) }, 'Bing search failed');
    return [];
  }
}

export function parseBingHTML(
  html: string,
  limit: number = 10,
): SearchResult[] {
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

function isExternalBingUrl(value: string): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== 'bing.com' && !hostname.endsWith('.bing.com');
  } catch {
    return false;
  }
}
