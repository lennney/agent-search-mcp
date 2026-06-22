import { SearchResult } from '../types.js';

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Provider-aware dedup: same provider only searches once.
 * From ddgs: track which providers we've already queried.
 */
export function dedupByProvider(engines: string[]): string[] {
  // Map engine -> provider (e.g., 'ddg' -> 'bing', 'sogou' -> 'sogou')
  const providerMap: Record<string, string> = {
    duckduckgo: 'bing',  // DDG uses Bing backend
    sogou: 'sogou',
    brave: 'brave',
    tavily: 'tavily',
  };
  
  const seenProviders = new Set<string>();
  const uniqueEngines: string[] = [];
  
  for (const engine of engines) {
    const provider = providerMap[engine] || engine;
    if (!seenProviders.has(provider)) {
      seenProviders.add(provider);
      uniqueEngines.push(engine);
    }
  }
  
  return uniqueEngines;
}

/**
 * URL dedup with frequency counting.
 * From ddgs: track how many engines returned each URL.
 * Keep the item with longer body (richer content).
 */
export function dedupByUrl(results: SearchResult[]): { results: SearchResult[]; frequencies: Map<string, number> } {
  const seen = new Map<string, SearchResult>();
  const frequencies = new Map<string, number>();
  
  for (const r of results) {
    const key = normalizeUrl(r.url);
    frequencies.set(key, (frequencies.get(key) || 0) + 1);
    
    if (!seen.has(key)) {
      seen.set(key, r);
    } else {
      // From ddgs: keep the item with longer body (richer content)
      const existing = seen.get(key)!;
      if ((r.snippet?.length || 0) > (existing.snippet?.length || 0)) {
        seen.set(key, r);
      }
    }
  }
  
  return { results: Array.from(seen.values()), frequencies };
}

/**
 * Title dedup with Jaccard similarity.
 */
export function dedupByTitle(results: SearchResult[], threshold = 0.85): SearchResult[] {
  const kept: SearchResult[] = [];
  for (const r of results) {
    const isDuplicate = kept.some(k => jaccard(k.title, r.title) > threshold);
    if (!isDuplicate) kept.push(r);
  }
  return kept;
}

/**
 * Filter low-quality results.
 * From ddgs: post_extract_results filters ads and invalid results.
 */
export function filterLowQuality(results: SearchResult[]): SearchResult[] {
  return results.filter(r => {
    // Filter empty snippets
    if (!r.snippet || r.snippet.length < 20) return false;
    
    // Filter DDG ads
    if (r.url.includes('y.js?') || r.url.includes('/ad/')) return false;
    
    // Filter invalid URLs
    if (!r.url.startsWith('http')) return false;
    
    // Filter DDG ad redirects
    if (r.url.includes('duckduckgo.com/y.js')) return false;
    
    // Filter search engine internal links
    if (r.url.includes('sogou.com/link')) return false;
    
    // Filter Wikipedia categories (low quality)
    if (r.url.includes('wikipedia.org/wiki/Category:')) return false;
    
    return true;
  });
}

function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
