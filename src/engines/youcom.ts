import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import { logger } from '../infrastructure/logger.js';

export const youcomProvider = {
  id: 'youcom' as const,
  name: 'You.com Search',
  isFree: false,
  languages: ['en', 'zh'],
};

interface YouComSearchItem {
  url?: string;
  title?: string;
  description?: string;
  snippets?: string[];
}

interface YouComSearchResponse {
  results?: {
    web?: YouComSearchItem[];
    news?: YouComSearchItem[];
  };
}

function mapResult(result: YouComSearchItem): SearchResult | null {
  const title = result.title?.trim() || '';
  const url = result.url?.trim() || '';
  if (!title || !url) return null;

  return {
    title,
    url,
    snippet: result.description?.trim() || result.snippets?.[0]?.trim() || '',
    source: 'youcom',
    engines: ['youcom'],
  };
}

export async function searchYouCom(query: string, count: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  const url = new URL('https://ydc-index.io/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('count', String(count));

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const apiKey = process.env.YDC_API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const res = await fetch(url.toString(), {
    headers,
    signal: withTimeout(options?.signal, 10000),
  });

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      if (options?.throwOnError) throw new Error(`You.com HTTP ${res.status}`);
      logger.warn({ status: res.status }, 'You.com HTTP client error');
      return [];
    }
    throw new Error(`You.com HTTP ${res.status}`);
  }

  const data = (await res.json()) as YouComSearchResponse;
  const combined = [...(data.results?.web || []), ...(data.results?.news || [])];
  return combined
    .map(mapResult)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, count);
}
