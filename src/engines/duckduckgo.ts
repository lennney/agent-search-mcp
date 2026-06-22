import { SearchResult } from '../types.js';

const DDG_HTML_URL = 'https://html.duckduckgo.com/html/';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Parse DuckDuckGo HTML search results using regex
 */
function parseDdgHtml(html: string, engine: string): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>.*?<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>.*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>.*?<span[^>]*class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/span>/gis;

  let match: RegExpExecArray | null;
  while ((match = resultRegex.exec(html)) !== null) {
    const url = match[1]?.trim() || '';
    const title = match[2]?.replace(/<[^>]+>/g, '').trim() || '';
    const snippet = match[3]?.replace(/<[^>]+>/g, '').trim() || '';
    const source = match[4]?.replace(/<[^>]+>/g, '').trim() || '';

    if (title && url) {
      results.push({ title, url, snippet, source, engines: [engine] });
    }
  }

  // Fallback: broader extraction
  if (results.length === 0) {
    const blockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gis;
    while ((match = blockRegex.exec(html)) !== null) {
      const block = match[1];
      const urlMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"/);
      const titleMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      const descMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/);
      const srcMatch = block.match(/class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\//);

      const url = urlMatch?.[1]?.trim() || '';
      const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      const snippet = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      const source = srcMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

      if (title && url) {
        results.push({ title, url, snippet, source, engines: [engine] });
      }
    }
  }

  return results;
}

export const duckduckgoProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo',
  isFree: true,
  languages: ['en'],
};

export async function searchDuckDuckGo(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const body = new URLSearchParams({ q: query }).toString();

    const response = await fetch(DDG_HTML_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned status ${response.status}`);
    }

    const html = await response.text();
    const allResults = parseDdgHtml(html, 'duckduckgo');

    // If we didn't get enough results on the first page, paginate
    if (allResults.length < limit) {
      // Try to extract more from subsequent pages
      // For now, just return what we have
    }

    return allResults.slice(0, limit);
  } catch (error) {
    console.error('DuckDuckGo search failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}
