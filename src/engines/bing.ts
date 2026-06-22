import { SearchResult } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';

export const bingProvider = {
  id: 'bing' as const,
  name: 'Bing',
  isFree: true,
  languages: ['en', 'zh'],
};

export async function searchBing(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`Bing: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseBingResults(html, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout')) {
      console.error('Bing: Search timed out');
    } else {
      console.error('Bing search failed:', msg.slice(0, 200));
    }
    return [];
  }
}

function parseBingResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  
  // Parse Bing HTML results
  // Pattern: <li class="b_algo"><h2><a href="URL">TITLE</a></h2><p>SNIPPET</p></li>
  const resultRegex = /<li class="b_algo">[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  
  let match;
  while ((match = resultRegex.exec(html)) && results.length < limit) {
    const url = match[1];
    const title = decodeHTMLTags(match[2]);
    const snippet = decodeHTMLTags(match[3]);
    
    if (url && title) {
      results.push({
        title,
        url,
        snippet: snippet || '',
        source: 'bing',
        engines: ['bing'],
      });
    }
  }
  
  return results;
}
