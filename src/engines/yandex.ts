import { SearchResult } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';

export const yandexProvider = {
  id: 'yandex' as const,
  name: 'Yandex',
  isFree: true,
  languages: ['ru', 'en', 'auto'],
};

export async function searchYandex(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = `https://yandex.com/search/?text=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`Yandex: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseYandexHTML(html, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.error('Yandex: Search timed out');
    } else {
      console.error('Yandex search failed:', msg.slice(0, 200));
    }
    return [];
  }
}

function parseYandexHTML(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const blockRegex = /<li[^>]*class="[^"]*serp-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
    const block = match[1];
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = titleMatch[1];
    const title = decodeHTMLTags(titleMatch[2]);
    if (!url || !title || url.includes('yandex')) continue;

    const snippetMatch = block.match(/<div[^>]*class="[^"]*text-container[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = snippetMatch ? decodeHTMLTags(snippetMatch[1]) : '';

    results.push({
      title,
      url,
      snippet,
      source: 'yandex',
      engines: ['yandex'],
    });
  }

  return results;
}
