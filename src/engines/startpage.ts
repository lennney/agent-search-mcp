import { SearchResult } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';

export const startpageProvider = {
  id: 'startpage' as const,
  name: 'Startpage',
  isFree: true,
  languages: ['en', 'auto'],
};

async function getScValue(): Promise<string> {
  try {
    const res = await fetch('https://www.startpage.com/', {
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const match = html.match(/name="sc"\s+value="([^"]+)"/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

export async function searchStartpage(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const sc = await getScValue();
    if (!sc) {
      console.error('Startpage: Failed to get sc token');
      return [];
    }

    const body = new URLSearchParams({
      query,
      sc,
      cat: 'web',
      t: 'device',
      abp: '1',
      abd: '0',
      abe: '0',
      segment: 'organic',
    }).toString();

    const res = await fetch('https://www.startpage.com/sp/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.startpage.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Startpage: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseStartpageHTML(html, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.error('Startpage: Search timed out');
    } else {
      console.error('Startpage search failed:', msg.slice(0, 200));
    }
    return [];
  }
}

function parseStartpageHTML(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Find result blocks: <div class="result"> containing <a href=...>
  const blockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    if (!url || url.includes('startpage.com')) continue;

    // Get surrounding context for title and snippet
    const pos = match.index;
    const context = html.slice(Math.max(0, pos - 200), Math.min(html.length, pos + 2000));

    // Title: <h2>...</h2>
    const titleMatch = context.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch ? decodeHTMLTags(titleMatch[1]) : '';

    // Snippet: <p>...</p>
    const snippetMatch = context.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? decodeHTMLTags(snippetMatch[1]) : '';

    if (title && url) {
      results.push({
        title,
        url,
        snippet,
        source: 'startpage',
        engines: ['startpage'],
      });
    }
  }

  return results;
}