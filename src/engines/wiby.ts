import type {
  EngineSearchOptions,
  SearchProviderInfo,
  SearchResult,
} from '../types.js';
import { EngineAdapterError } from './engine-error.js';
import {
  asJsonObject,
  fetchSearchJson,
  isWebUrl,
  readString,
} from './json-search-api.js';

export const wibyProvider: SearchProviderInfo = {
  id: 'wiby',
  name: 'Wiby',
  isFree: true,
  languages: ['en'],
};

function parseWibyResult(value: unknown): SearchResult | null {
  const item = asJsonObject(value);
  if (!item) return null;
  const title = readString(item.Title ?? item.title);
  const url = readString(item.URL ?? item.url);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(item.Snippet ?? item.snippet),
    source: 'wiby.me',
    engines: ['wiby'],
  };
}

function parseWibyResponse(value: unknown, count: number): SearchResult[] {
  if (!Array.isArray(value)) {
    throw new EngineAdapterError(
      'parse_error',
      'Wiby returned an invalid result payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  const results = value
    .map(parseWibyResult)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
  if (results[0]) {
    const attribution = 'Search index: https://wiby.me/';
    results[0] = {
      ...results[0],
      snippet: results[0].snippet
        ? `${results[0].snippet} ${attribution}`
        : attribution,
    };
  }
  return results;
}

export async function searchWiby(
  query: string,
  count: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  try {
    const url = new URL('https://wiby.me/json/');
    url.searchParams.set('q', query);
    const data = await fetchSearchJson({
      provider: 'Wiby',
      url,
      init: {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      signal: options?.signal,
      timeoutMs: 8_000,
      retryServerErrors: false,
    });
    return parseWibyResponse(data, Math.max(1, count));
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return [];
  }
}
