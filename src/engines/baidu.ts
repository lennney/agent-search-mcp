import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

import { logger } from '../infrastructure/logger.js';
import type { EngineSearchOptions, SearchResult } from '../types.js';
import {
  createHtmlParseError,
  fetchSearchHtml,
  normalizeHtmlText,
  resolveHtmlResultUrl,
} from './html-search.js';

const BAIDU_SEARCH_URL = 'https://www.baidu.com/s';

export const baiduProvider = {
  id: 'baidu' as const,
  name: 'Baidu',
  isFree: true,
  languages: ['zh'],
};

export async function searchBaidu(
  query: string,
  limit: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL(BAIDU_SEARCH_URL);
    url.searchParams.set('wd', query);
    url.searchParams.set('rn', String(limit));
    const html = await fetchSearchHtml('baidu', url, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
          + 'AppleWebKit/537.36 (KHTML, like Gecko) '
          + 'Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    const results = parseBaiduHTML(html, limit);
    if (!hasBaiduSearchSurface(html) || (hasBaiduResultCards(html) && results.length === 0)) {
      throw createHtmlParseError('baidu');
    }
    return results;
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ err: msg.slice(0, 200) }, 'Baidu search failed');
    return [];
  }
}

export function parseBaiduHTML(html: string, limit: number = 10): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();
  const cards = $('#content_left .c-container, #content_left .result, .c-container, .result');

  cards.each((_, element) => {
    if (results.length >= limit) return;

    const card = $(element);
    const titleLink = card.find('h3 a[href], h2 a[href], a[href]').first();
    const rawUrl = card.attr('data-landurl')
      ?? card.attr('mu')
      ?? titleLink.attr('href')
      ?? '';
    const url = resolveHtmlResultUrl(
      rawUrl,
      BAIDU_SEARCH_URL,
    );
    const title = normalizeHtmlText(titleLink.text());
    if (!title || !isExternalBaiduUrl(url) || seenUrls.has(url)) return;

    const snippet = extractBaiduSnippet(card);
    seenUrls.add(url);
    results.push({
      title,
      url,
      snippet,
      source: 'baidu',
      engines: ['baidu'],
    });
  });

  return results;
}

function extractBaiduSnippet(card: cheerio.Cheerio<AnyNode>): string {
  const knownSnippet = card
    .find('.c-abstract, [class*="content-right_"], .c-color-text, .f13')
    .first();
  const knownText = normalizeHtmlText(knownSnippet.text());
  if (knownText) return knownText;

  let fallback = '';
  card.find('span').each((_, element) => {
    if (fallback) return;
    const text = normalizeHtmlText(card.find(element).text());
    if (text.length >= 20 && text.length <= 200) fallback = text;
  });
  return fallback;
}

function hasBaiduSearchSurface(html: string): boolean {
  const $ = cheerio.load(html);
  const resultContainer = $('#content_left').first();
  return hasBaiduResultCards(html)
    || (resultContainer.length > 0
      && resultContainer.children().length === 0
      && normalizeHtmlText(resultContainer.text()) === '');
}

function hasBaiduResultCards(html: string): boolean {
  return cheerio.load(html)(
    '#content_left .c-container, #content_left .result, .c-container, .result',
  ).length > 0;
}

function isExternalBaiduUrl(url: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname !== 'baidu.com' && !hostname.endsWith('.baidu.com');
  } catch {
    return false;
  }
}
