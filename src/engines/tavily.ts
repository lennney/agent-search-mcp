import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import {
  asJsonObject,
  isWebUrl,
  readString,
} from './json-search-api.js';

function parseTavilyResult(value: unknown): SearchResult | null {
  const result = asJsonObject(value);
  if (!result) return null;
  const title = readString(result.title);
  const url = readString(result.url);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(result.content),
    source: 'tavily',
    engines: ['tavily'],
  };
}

export class TavilyProvider {
  id = 'tavily';
  name = 'Tavily Search';
  isFree = false;
  languages = ['en', 'zh'];

  async search(query: string, count: number, options?: EngineSearchOptions): Promise<SearchResult[]> {
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
      signal: withTimeout(options?.signal, 5000),
    });

    if (!res.ok) throw new Error(`Tavily returned ${res.status}`);

    const data = asJsonObject(await res.json());
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map(parseTavilyResult)
      .filter((result): result is SearchResult => result !== null);
  }
}

export const tavilyProvider = new TavilyProvider();
