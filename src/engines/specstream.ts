import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import {
  asJsonObject,
  isWebUrl,
  readString,
} from './json-search-api.js';
import { providerCatalog } from './provider-catalog.js';

function parseSpecStreamResult(value: unknown): SearchResult | null {
  const result = asJsonObject(value);
  if (!result) return null;
  const title = readString(result.title);
  const url = readString(result.url);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(result.content),
    source: 'specstream',
    engines: ['specstream'],
  };
}

export class SpecStreamProvider {
  readonly id = providerCatalog.specstream.id;
  readonly name = providerCatalog.specstream.name;
  readonly isFree = providerCatalog.specstream.isFree;
  readonly languages = providerCatalog.specstream.languages;

  async search(query: string, count: number, options?: EngineSearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.SPECSTREAM_API_KEY;
    if (!apiKey) return [];

    const res = await fetch('https://api.specstream.ai/v1/web-search', {
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

    if (!res.ok) throw new Error(`SpecStream returned ${res.status}`);

    const data = asJsonObject(await res.json());
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map(parseSpecStreamResult)
      .filter((result): result is SearchResult => result !== null);
  }
}

export const specstreamProvider = new SpecStreamProvider();
