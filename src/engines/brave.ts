import { SearchResult } from '../types.js';

export class BraveProvider {
  id = 'brave';
  name = 'Brave Search';
  isFree = false;
  languages = ['en', 'zh'];

  async search(query: string, count: number): Promise<SearchResult[]> {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) return [];

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));

    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Brave returned ${res.status}`);

    const data = await res.json();
    return (data.web?.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
      source: 'brave',
      engines: ['brave'],
    }));
  }
}

export const braveProvider = new BraveProvider();
