import { SearchResult, type EngineSearchOptions } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';
import { withTimeout } from '../infrastructure/abort.js';
import { logger } from '../infrastructure/logger.js';
import { EngineAdapterError } from './engine-error.js';
import { providerCatalog } from './provider-catalog.js';

const BAIDU_CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;

export const baiduProvider = providerCatalog.baidu;

export async function searchBaidu(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const url = new URL('https://www.baidu.com/s');
    url.searchParams.set('wd', query);
    url.searchParams.set('rn', String(limit));
    url.searchParams.set('pn', '0');
    url.searchParams.set('tn', 'json');
    url.searchParams.set('ie', 'utf-8');

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'manual',
      signal: withTimeout(options?.signal, 10000),
    });

    if (isBaiduCaptchaRedirect(res.headers.get('location'))) {
      throw createBaiduChallengeError();
    }

    if (!res.ok) {
      if (options?.throwOnError) throw new Error(`Baidu HTTP ${res.status}`);
      logger.warn({ status: res.status }, 'Baidu HTTP error');
      return [];
    }

    const body = await res.text();
    const jsonResults = parseBaiduJSON(body, limit);
    if (jsonResults !== null) return jsonResults;

    if (looksLikeBaiduChallenge(body)) {
      throw createBaiduChallengeError();
    }
    return parseBaiduHTML(body, limit);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout')) {
      logger.warn('Baidu search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'Baidu search failed');
    }
    return [];
  }
}

function parseBaiduJSON(body: string, limit: number): SearchResult[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }

  if (!isRecord(payload)) return [];
  const feed = payload.feed;
  if (!isRecord(feed) || !Array.isArray(feed.entry)) return [];

  const results: SearchResult[] = [];
  for (const candidate of feed.entry) {
    if (results.length >= limit) break;
    if (!isRecord(candidate)) continue;

    const rawTitle = typeof candidate.title === 'string' ? candidate.title : '';
    const rawUrl = typeof candidate.url === 'string' ? candidate.url : '';
    if (!rawTitle || !isUsableBaiduResultUrl(rawUrl)) continue;

    results.push({
      title: decodeHTMLTags(rawTitle),
      url: rawUrl,
      snippet: decodeHTMLTags(typeof candidate.abs === 'string' ? candidate.abs : ''),
      source: 'baidu',
      engines: ['baidu'],
    });
  }

  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUsableBaiduResultUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    return hostname !== 'baidu.com' && !hostname.endsWith('.baidu.com');
  } catch {
    return false;
  }
}

function createBaiduChallengeError(): EngineAdapterError {
  return new EngineAdapterError(
    'bot_challenge',
    'Baidu returned an anti-bot verification page',
    {
      retryable: false,
      cooldownMs: BAIDU_CHALLENGE_COOLDOWN_MS,
      suggestion: 'Wait for the provider cooldown or use another network runner',
    },
  );
}

function isBaiduCaptchaRedirect(location: string | null): boolean {
  if (!location) return false;
  try {
    const url = new URL(location, 'https://www.baidu.com');
    return url.protocol === 'https:'
      && url.hostname === 'wappass.baidu.com'
      && url.pathname.startsWith('/static/captcha');
  } catch {
    return false;
  }
}

function looksLikeBaiduChallenge(html: string): boolean {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHTMLTags(titleMatch[1]) : '';
  if (title.includes('百度安全验证')) return true;
  if (getResultBlocks(html).length > 0) return false;

  const text = decodeHTMLTags(html).replace(/\s+/g, '');
  return text.includes('请完成验证后继续访问')
    || (text.includes('访问异常') && text.includes('验证码'));
}

/**
 * Extract a snippet from a Baidu result block using multiple fallback patterns.
 *
 * Patterns tried in order:
 *   1. <div class="c-abstract"> or <span class="c-abstract"> — classic Baidu snippet
 *   2. <span class="content-right_*"> — new-style Baidu snippet
 *   3. Any <span> containing 20–200 chars of meaningful text
 */
function extractBaiduSnippet(block: string): string {
  // Pattern 1: c-abstract div or span (classic Baidu snippet)
  const abstractMatch = block.match(/<(?:div|span)[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
  if (abstractMatch) {
    const text = decodeHTMLTags(abstractMatch[1]);
    if (text) return text;
  }

  // Pattern 2: content-right_* class (new-style Baidu snippet)
  const contentRightMatch = block.match(/<(?:div|span)[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
  if (contentRightMatch) {
    const text = decodeHTMLTags(contentRightMatch[1]);
    if (text) return text;
  }

  // Pattern 3: any <span> with 20-200 chars of meaningful text
  const spanRegex = /<span[^>]*>([\s\S]*?)<\/span>/g;
  let spanMatch: RegExpExecArray | null;
  while ((spanMatch = spanRegex.exec(block)) !== null) {
    const text = decodeHTMLTags(spanMatch[1]);
    if (text.length >= 20 && text.length <= 200) {
      return text;
    }
  }

  return '';
}

/**
 * Split Baidu HTML into result blocks around <h3><a href="..."> headers.
 * Returns one block per search result, spanning from slightly before the
 * h3 tag to just before the next h3 (or end of HTML).
 */
function getResultBlocks(html: string): string[] {
  const h3Regex = /<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/g;
  const h3Positions: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = h3Regex.exec(html)) !== null) {
    h3Positions.push(match.index);
  }

  if (h3Positions.length === 0) return [];

  const blocks: string[] = [];
  for (let i = 0; i < h3Positions.length; i++) {
    const start = h3Positions[i];
    const end = i + 1 < h3Positions.length ? h3Positions[i + 1] : html.length;
    blocks.push(html.slice(start, end));
  }

  return blocks;
}

/**
 * Parse Baidu search result HTML into structured SearchResult objects.
 *
 * Uses a block-based approach: the HTML is split at <h3> result headers,
 * then each block is processed for title, URL, and snippet independently.
 * Snippet extraction tries three fallback patterns (c-abstract,
 * content-right_*, and generic spans).
 */
export function parseBaiduHTML(html: string, limit: number = 10): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = getResultBlocks(html);

  if (blocks.length === 0) return results;

  for (const block of blocks) {
    if (results.length >= limit) break;

    const h3Match = block.match(/<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/);
    if (!h3Match) continue;

    const url = h3Match[1];
    const title = decodeHTMLTags(h3Match[2]);

    if (!url || !title || !isUsableBaiduResultUrl(url)) continue;

    const snippet = extractBaiduSnippet(block);

    results.push({
      title,
      url,
      snippet,
      source: 'baidu',
      engines: ['baidu'],
    });
  }

  return results;
}
