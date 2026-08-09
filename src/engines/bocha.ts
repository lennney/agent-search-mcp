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

export const bochaProvider = providerCatalog.bocha;

function parseBochaResult(value: unknown): SearchResult | null {
  const item = asJsonObject(value);
  if (!item) return null;
  const title = readString(item.name ?? item.title);
  const url = readString(item.url);
  if (!title || !isWebUrl(url)) return null;
  const publishedAt = readString(item.datePublished);

  return {
    title,
    url,
    snippet: readString(item.snippet ?? item.summary),
    source: 'bocha',
    engines: ['bocha'],
    ...(publishedAt ? { published_at: publishedAt } : {}),
  };
}

function parseBochaResponse(value: unknown, count: number): SearchResult[] {
  const root = asJsonObject(value);
  if (!root) {
    throw new EngineAdapterError(
      'parse_error',
      'Bocha returned an invalid JSON payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  const code = root.code;
  if (code !== undefined && Number(code) !== 200) {
    const numericCode = Number(code);
    const permissionDenied = numericCode === 401 || numericCode === 403;
    const rateLimited = numericCode === 429;
    throw new EngineAdapterError(
      permissionDenied
        ? 'permission_denied'
        : rateLimited
          ? 'rate_limited'
          : numericCode >= 500
            ? 'upstream_5xx'
            : 'upstream_4xx',
      permissionDenied
        ? 'Bocha rejected the configured credential'
        : rateLimited
          ? 'Bocha rate limit reached'
          : `Bocha rejected the request (${readString(code) || 'unknown'})`,
      {
        retryable: numericCode >= 500,
        ...(rateLimited ? { cooldownMs: 30_000 } : {}),
        suggestion: permissionDenied
          ? 'Check BOCHA_API_KEY and account access'
          : rateLimited
            ? 'Use another provider or retry after the cooldown expires'
            : 'Use another provider or retry later',
      },
    );
  }

  const webPages = asJsonObject(root.webPages);
  const values = webPages?.value;
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    throw new EngineAdapterError(
      'parse_error',
      'Bocha returned an invalid webPages payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  return values
    .map(parseBochaResult)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
}

export async function searchBocha(
  query: string,
  count: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  const apiKey = process.env.BOCHA_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const boundedCount = Math.min(Math.max(count, 1), 50);
    const data = await fetchSearchJson({
      provider: 'Bocha',
      url: 'https://api.bochaai.com/v1/web-search',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          freshness: 'noLimit',
          summary: false,
          count: boundedCount,
        }),
      },
      signal: options?.signal,
    });
    return parseBochaResponse(data, boundedCount);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return [];
  }
}
