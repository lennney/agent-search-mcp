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

export const tencentWsaProvider = providerCatalog.tencent_wsa;

function createTencentWsaError(code: string): EngineAdapterError {
  if (
    code.includes('UnauthorizedOperation')
    || code.includes('AuthFailure')
    || code.includes('ResourceNotFound')
    || code.includes('ResourceUnavailable')
  ) {
    return new EngineAdapterError(
      'permission_denied',
      `Tencent WSA rejected the request (${code})`,
      {
        retryable: false,
        suggestion: 'Check TENCENT_WSA_API_KEY and the enabled WSA service tier',
      },
    );
  }
  if (code.includes('InvalidParameter')) {
    return new EngineAdapterError(
      'validation_error',
      `Tencent WSA rejected a request parameter (${code})`,
      {
        retryable: false,
        suggestion: 'Check the query and Tencent WSA request limits',
      },
    );
  }
  if (code.includes('RequestLimitExceeded')) {
    return new EngineAdapterError(
      'rate_limited',
      'Tencent WSA rate limit reached',
      {
        retryable: false,
        cooldownMs: 30_000,
        suggestion: 'Use another provider or retry after the cooldown expires',
      },
    );
  }
  return new EngineAdapterError(
    'upstream_5xx',
    `Tencent WSA returned an upstream error (${code || 'unknown'})`,
    {
      retryable: code.includes('InternalError'),
      suggestion: 'Use another provider or retry later',
    },
  );
}

function parseTencentPage(value: unknown): SearchResult | null {
  let pageValue = value;
  if (typeof value === 'string') {
    try {
      pageValue = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  const page = asJsonObject(pageValue);
  if (!page) return null;
  const title = readString(page.title ?? page.Title);
  const url = readString(page.url ?? page.Url);
  if (!title || !isWebUrl(url)) return null;
  const publishedAt = readString(
    page.date ?? page.datePublished ?? page.Date,
  );

  return {
    title,
    url,
    snippet: readString(
      page.passage ?? page.Passage ?? page.content ?? page.Content,
    ),
    source: 'tencent_wsa',
    engines: ['tencent_wsa'],
    ...(publishedAt ? { published_at: publishedAt } : {}),
  };
}

function parseTencentWsaResponse(
  value: unknown,
  count: number,
): SearchResult[] {
  const root = asJsonObject(value);
  const response = asJsonObject(root?.Response) ?? root;
  const error = asJsonObject(response?.Error);
  if (error) throw createTencentWsaError(readString(error.Code));

  const pages = response?.Pages;
  if (pages === undefined || pages === null) return [];
  if (!Array.isArray(pages)) {
    throw new EngineAdapterError(
      'parse_error',
      'Tencent WSA returned an invalid Pages payload',
      {
        retryable: false,
        suggestion: 'Use another provider while the response schema is checked',
      },
    );
  }

  return pages
    .map(parseTencentPage)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
}

export async function searchTencentWsa(
  query: string,
  count: number = 10,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  const apiKey = process.env.TENCENT_WSA_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const data = await fetchSearchJson({
      provider: 'Tencent WSA',
      url: 'https://api.wsa.cloud.tencent.com/SearchPro',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Query: query, Mode: 0 }),
      },
      signal: options?.signal,
    });
    return parseTencentWsaResponse(data, Math.max(1, count));
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return [];
  }
}
