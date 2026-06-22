import { SearchResult } from '../types.js';

export class TavilyProvider {
  id = 'tavily';
  name = 'Tavily Search';
  isFree = false;
  languages = ['en', 'zh'];

  async search(query: string, count: number): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: count,
        search_depth: 'basic',
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Tavily returned ${res.status}`);

    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
      source: 'tavily',
      engines: ['tavily'],
    }));
  }
}

export const tavilyProvider = new TavilyProvider();
