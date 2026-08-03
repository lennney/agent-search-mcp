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

export const serpbaseProvider: SearchProviderInfo = {
  id: 'serpbase',
  name: 'SerpBase Google Search',
  isFree: false,
  languages: ['en', 'zh', 'auto'],
};

function parseSerpBaseResult(value: unknown): SearchResult | null {
  const item = asJsonObject(value);
  if (!item) return null;
  const title = readString(item.title);
  const url = readString(item.link);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(item.snippet),
    source: 'serpbase',
    engines: ['serpbase'],
  };
}

function parseSerpBaseResponse(value: unknown, count: number): SearchResult[] {
  const root = asJsonObject(value);
  if (!root) {
    throw new EngineAdapterError(
      'parse_error',
      'SerpBase returned an invalid JSON payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }
  if (readString(root.error)) {
    throw new EngineAdapterError(
      'upstream_4xx',
      'SerpBase rejected the search request',
      {
        retryable: false,
        suggestion: 'Check the SerpBase API key and account access',
      },
    );
  }

  const organic = root.organic_results;
  if (organic === undefined || organic === null) return [];
  if (!Array.isArray(organic)) {
    throw new EngineAdapterError(
      'parse_error',
      'SerpBase returned an invalid organic_results payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  return organic
    .map(parseSerpBaseResult)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
}

export async function searchSerpBase(
  query: string,
  count: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  const apiKey = process.env.SERPBASE_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const boundedCount = Math.min(Math.max(count, 1), 100);
    const url = new URL('https://api.serpbase.dev/google/search');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('num', String(boundedCount));

    const data = await fetchSearchJson({
      provider: 'SerpBase',
      url,
      init: {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      signal: options?.signal,
    });
    return parseSerpBaseResponse(data, boundedCount);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return [];
  }
}
