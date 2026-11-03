import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import {
  asJsonObject,
  isWebUrl,
  readString,
} from './json-search-api.js';
import { providerCatalog } from './provider-catalog.js';

function parseKeenableResult(value: unknown): SearchResult | null {
  const result = asJsonObject(value);
  if (!result) return null;
  const title = readString(result.title);
  const url = readString(result.url);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(result.snippet) || readString(result.description),
    source: 'keenable',
    engines: ['keenable'],
  };
}

/** Keenable web search (https://keenable.ai), an independent index built for agents. */
export class KeenableProvider {
  readonly id = providerCatalog.keenable.id;
  readonly name = providerCatalog.keenable.name;
  readonly isFree = providerCatalog.keenable.isFree;
  readonly languages = providerCatalog.keenable.languages;

  async search(query: string, count: number, options?: EngineSearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.KEENABLE_API_KEY;
    if (!apiKey) return [];

    const res = await fetch('https://api.keenable.ai/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ query, max_results: Math.min(Math.max(count, 1), 50) }),
      signal: withTimeout(options?.signal, 5000),
    });

    if (!res.ok) throw new Error(`Keenable returned ${res.status}`);

    const data = asJsonObject(await res.json());
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map(parseKeenableResult)
      .filter((result): result is SearchResult => result !== null);
  }
}

export const keenableProvider = new KeenableProvider();
