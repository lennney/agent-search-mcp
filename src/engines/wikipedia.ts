import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';

export const wikipediaProvider = {
  id: 'wikipedia' as const,
  name: 'Wikipedia',
  isFree: true,
  languages: ['en', 'zh', 'ja', 'de', 'fr', 'es', 'auto'],
};

export async function searchWikipedia(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const maxLimit = Math.min(limit, 10);
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&profile=fuzzy&limit=${maxLimit}&search=${encodeURIComponent(query)}&format=json&origin=*`;

    const res = await fetch(url, { signal: withTimeout(options?.signal, 10000) });

    if (!res.ok) {
      if (options?.throwOnError) throw new Error(`Wikipedia HTTP ${res.status}`);
      console.error(`Wikipedia: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    // data format: [query, [title1, title2...], [snippet1, snippet2...], [url1, url2...]]
    if (!Array.isArray(data) || data.length < 4 || !data[1]) return [];

    const results: SearchResult[] = [];
    const titles = data[1] as string[];
    const snippets = data[2] as string[];
    const urls = data[3] as string[];

    for (let i = 0; i < Math.min(titles.length, limit); i++) {
      if (titles[i] && urls[i]) {
        results.push({
          title: titles[i],
          url: urls[i],
          snippet: snippets[i] || '',
          source: 'wikipedia',
          engines: ['wikipedia'],
        });
      }
    }

    return results;
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.error('Wikipedia: Search timed out');
    } else {
      console.error('Wikipedia search failed:', msg.slice(0, 200));
    }
    return [];
  }
}
