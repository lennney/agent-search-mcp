import { SearchResult } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';

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
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`Baidu: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseBaiduResults(html, limit);
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

function parseBaiduResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  
  // Fallback: use simpler h3 > a pattern (more robust)
  const simpleRegex = /<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/g;
  let match;
  while ((match = simpleRegex.exec(html)) && results.length < limit) {
    const url = match[1];
    const title = decodeHTMLTags(match[2]);
    
    if (url && title && !url.includes('baidu.com')) {
      results.push({
        title,
        url,
        snippet: '',
        source: 'baidu',
        engines: ['baidu'],
      });
    }
  }
  
  return results;
}
