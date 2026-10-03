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

export const serplyProvider = providerCatalog.serply;

// Serply returns at most one Google results page per call.
const MAX_SERPLY_RESULTS = 10;

function parseSerplyResult(value: unknown): SearchResult | null {
  const item = asJsonObject(value);
  if (!item) return null;
  const title = readString(item.title);
  const url = readString(item.link);
  if (!title || !isWebUrl(url)) return null;

  return {
    title,
    url,
    snippet: readString(item.description),
    source: 'serply',
    engines: ['serply'],
  };
}

function parseSerplyResponse(value: unknown, count: number): SearchResult[] {
  const root = asJsonObject(value);
  if (!root) {
    throw new EngineAdapterError(
      'parse_error',
      'Serply returned an invalid JSON payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }
  if (readString(root.detail) || readString(root.error)) {
    throw new EngineAdapterError(
      'upstream_4xx',
      'Serply rejected the search request',
      {
        retryable: false,
        suggestion: 'Check the Serply account and request configuration',
      },
    );
  }

  const results = root.results;
  if (results === undefined || results === null) return [];
  if (!Array.isArray(results)) {
    throw new EngineAdapterError(
      'parse_error',
      'Serply returned an invalid results payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  return results
    .map(parseSerplyResult)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
}

export async function searchSerply(
  query: string,
  count: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  const apiKey = process.env.SERPLY_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const boundedCount = Math.min(Math.max(count, 1), MAX_SERPLY_RESULTS);
    const url = new URL('https://api.serply.io/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(boundedCount));
    const data = await fetchSearchJson({
      provider: 'Serply',
      url: url.toString(),
      init: {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'agent-search-mcp',
          'X-Api-Key': apiKey,
        },
      },
      signal: options?.signal,
    });
    return parseSerplyResponse(data, boundedCount);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return [];
  }
}
