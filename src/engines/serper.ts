import type {
  EngineSearchOptions,
  SearchResult,
} from '../types.js';
import { EngineAdapterError } from './engine-error.js';
import {
  asJsonObject,
  fetchSearchJson,
  isWebUrl,
  readString,
} from './json-search-api.js';
import { providerCatalog } from './provider-catalog.js';

export const serperProvider = providerCatalog.serper;

function parseSerperResult(value: unknown): SearchResult | null {
  const item = asJsonObject(value);
  if (!item) return null;
  const title = readString(item.title);
  const url = readString(item.link);
  if (!title || !isWebUrl(url)) return null;
  const publishedAt = readString(item.date);

  return {
    title,
    url,
    snippet: readString(item.snippet),
    source: 'serper',
    engines: ['serper'],
    ...(publishedAt ? { published_at: publishedAt } : {}),
  };
}

function parseSerperResponse(value: unknown, count: number): SearchResult[] {
  const root = asJsonObject(value);
  if (!root) {
    throw new EngineAdapterError(
      'parse_error',
      'Serper returned an invalid JSON payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }
  if (readString(root.error)) {
    throw new EngineAdapterError(
      'upstream_4xx',
      'Serper rejected the search request',
      {
        retryable: false,
        suggestion: 'Check the Serper account and request configuration',
      },
    );
  }

  const organic = root.organic;
  if (organic === undefined || organic === null) return [];
  if (!Array.isArray(organic)) {
    throw new EngineAdapterError(
      'parse_error',
      'Serper returned an invalid organic-results payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  return organic
    .map(parseSerperResult)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
}

export async function searchSerper(
  query: string,
  count: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const boundedCount = Math.min(Math.max(count, 1), 100);
    const data = await fetchSearchJson({
      provider: 'Serper',
      url: 'https://google.serper.dev/search',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({ q: query, num: boundedCount }),
      },
      signal: options?.signal,
    });
    return parseSerperResponse(data, boundedCount);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return [];
  }
}
