import { SearchResult } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export const baiduProvider = {
  id: 'baidu' as const,
  name: 'Baidu',
  isFree: true,
  languages: ['zh'],
};

export async function searchBaidu(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: createTimeoutSignal(10000),
    });

    if (!res.ok) {
      console.error(`Baidu: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseBaiduHTML(html, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout')) {
      console.error('Baidu: Search timed out');
    } else {
      console.error('Baidu search failed:', msg.slice(0, 200));
    }
    return [];
  }
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

    if (!url || !title || url.includes('baidu.com')) continue;

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