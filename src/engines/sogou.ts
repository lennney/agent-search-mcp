import { SearchResult } from '../types.js';

const SOGOU_SEARCH_URL = 'https://www.sogou.com/web';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Parse Sogou search results HTML using regex
 */
function parseSogouHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Try to find result blocks
  // Sogou typically has: <div class="vrwrap"> or <div class="rb"> containing the results
  const blockRegex = /<div[^>]*(?:class="[^"]*vr(?:wrap|5)[^"]*"|class="[^"]*\brb\b[^"]*"|id="[^"]*result[^"]*")[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gis;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // Extract title link (h3 or h2 containing a link)
    const titleLinkRegex = /<h[23][^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
    const titleMatch = block.match(titleLinkRegex);

    if (!titleMatch) continue;

    const rawUrl = titleMatch[1]?.trim() || '';
    const title = titleMatch[2]?.replace(/<[^>]+>/g, '').trim() || '';

    if (!title || !rawUrl) continue;

    // Resolve the actual URL (Sogou wraps URLs in redirects)
    let url = rawUrl;
    try {
      const parsed = new URL(rawUrl, SOGOU_SEARCH_URL);
      const target = parsed.searchParams.get('url') || parsed.searchParams.get('u') || parsed.searchParams.get('link');
      if (target && /^https?:\/\//i.test(target)) {
        url = target;
      } else {
        url = parsed.toString();
      }
    } catch {
      // keep rawUrl
    }

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // Extract snippet
    const descMatch = block.match(/<p[^>]*class="[^"]*str_info[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/<div[^>]*class="[^"]*str_info[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || block.match(/class="[^"]*(?:str_info|ft|text-layout)[^"]*"[^>]*>([\s\S]*?)<\//i);
    const snippet = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

    // Extract source
    const srcMatch = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i)
      || block.match(/class="[^"]*(?:citeurl|g|url)[^"]*"[^>]*>([\s\S]*?)<\//i);
    let source = srcMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
    if (!source) {
      try { source = new URL(url).hostname; } catch { source = ''; }
    }

    results.push({ title, url, snippet, source, engines: ['sogou'] });
  }

  // Fallback: broader extraction for different page layouts
  if (results.length === 0) {
    const altBlockRegex = /<div[^>]*class="[^"]*vrwrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gis;
    let altBlockMatch: RegExpExecArray | null;
    while ((altBlockMatch = altBlockRegex.exec(html)) !== null) {
      const block = altBlockMatch[1];
      const aMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!aMatch) continue;

      const rawUrl = aMatch[1]?.trim() || '';
      const title = aMatch[2]?.replace(/<[^>]+>/g, '').trim() || '';
      if (!title || !rawUrl || seenUrls.has(rawUrl)) continue;
      seenUrls.add(rawUrl);

      let url = rawUrl;
      try {
        const parsed = new URL(rawUrl, SOGOU_SEARCH_URL);
        const target = parsed.searchParams.get('url') || parsed.searchParams.get('u');
        if (target && /^https?:\/\//i.test(target)) url = target;
      } catch { /* keep rawUrl */ }

      const descMatch = block.match(/(?:str_info|ft)[^>]*>([\s\S]*?)<\//i);
      const snippet = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

      let source = '';
      try { source = new URL(url).hostname; } catch { /* ignore */ }

      results.push({ title, url, snippet, source, engines: ['sogou'] });
    }
  }

  return results;
}

export const sogouProvider = {
  id: 'sogou' as const,
  name: 'Sogou Search',
  isFree: true,
  languages: ['zh'],
};

export async function searchSogou(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    const url = new URL(SOGOU_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('ie', 'utf8');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.sogou.com/',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Sogou returned status ${response.status}`);
    }

    const html = await response.text();

    // Check for anti-bot page
    if (html.toLowerCase().includes('antispider') || html.includes('请输入验证码') || html.includes('访问过于频繁')) {
      console.warn('Sogou returned an anti-bot challenge page');
      return [];
    }

    const results = parseSogouHtml(html);
    return results.slice(0, limit);
  } catch (error) {
    console.error('Sogou search failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}
