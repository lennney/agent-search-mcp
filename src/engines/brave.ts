import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import {
  asJsonObject,
  isWebUrl,
  readString,
} from './json-search-api.js';

function parseBraveResult(value: unknown): SearchResult | null {
  const result = asJsonObject(value);
  if (!result) return null;
  const title = readString(result.title);
  const url = readString(result.url);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(result.description),
    source: 'brave',
    engines: ['brave'],
  };
}

export class BraveProvider {
  id = 'brave';
  name = 'Brave Search';
  isFree = false;
  languages = ['en', 'zh'];

  async search(query: string, count: number, options?: EngineSearchOptions): Promise<SearchResult[]> {
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
      signal: withTimeout(options?.signal, 5000),
    });

    if (!res.ok) throw new Error(`Brave returned ${res.status}`);

    const data = asJsonObject(await res.json());
    const web = asJsonObject(data?.web);
    const results = Array.isArray(web?.results) ? web.results : [];
    return results
      .map(parseBraveResult)
      .filter((result): result is SearchResult => result !== null);
  }
}

export const braveProvider = new BraveProvider();
