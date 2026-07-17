import { SearchResult } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';

export const mojeekProvider = {
  id: 'mojeek' as const,
  name: 'Mojeek',
  isFree: true,
  languages: ['en', 'auto'],
};

export async function searchMojeek(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`Mojeek: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseMojeekHTML(html, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.error('Mojeek: Search timed out');
    } else {
      console.error('Mojeek search failed:', msg.slice(0, 200));
    }
    return [];
  }
}

function parseMojeekHTML(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const blockRegex = /<li[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    const title = decodeHTMLTags(match[2]);
    if (!url || !title) continue;

    const pos = match.index;
    const context = html.slice(pos, Math.min(html.length, pos + 1000));
    const snippetMatch = context.match(/<p[^>]*class="[^"]*s[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? decodeHTMLTags(snippetMatch[1]) : '';

    results.push({
      title,
      url,
      snippet,
      source: 'mojeek',
      engines: ['mojeek'],
    });
  }

  return results;
}
