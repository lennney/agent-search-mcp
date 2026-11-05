import { SearchResult, type EngineSearchOptions } from '../types.js';
import { EngineAdapterError } from './engine-error.js';
import {
  asJsonObject,
  fetchSearchJson,
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

    const data = asJsonObject(await fetchSearchJson({
      provider: 'Keenable',
      url: 'https://api.keenable.ai/v1/search',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ query, max_results: Math.min(Math.max(count, 1), 50) }),
      },
      signal: options?.signal,
      timeoutMs: 5000,
    }));
    if (!Array.isArray(data?.results)) {
      throw new EngineAdapterError(
        'parse_error',
        'Keenable returned an invalid response shape',
        {
          retryable: false,
          suggestion: 'Use another provider while the response schema is checked',
        },
      );
    }
    const results = data.results;
    return results
      .map(parseKeenableResult)
      .filter((result): result is SearchResult => result !== null);
  }
}

export const keenableProvider = new KeenableProvider();
