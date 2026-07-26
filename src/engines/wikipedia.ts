import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import { EngineAdapterError } from './engine-error.js';

const WIKIMEDIA_USER_AGENT =
  'agent-search-mcp/3.x (https://github.com/lennney/agent-search-mcp)';

export const wikipediaProvider = {
  id: 'wikipedia' as const,
  name: 'Wikipedia',
  isFree: true,
  languages: ['en', 'zh', 'ja', 'de', 'fr', 'es', 'auto'],
};

interface WikipediaPage {
  index?: number;
  title?: string;
  extract?: string;
  fullurl?: string;
}

interface WikipediaQueryResponse {
  query?: {
    pages?: WikipediaPage[];
  };
}

export async function searchWikipedia(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const maxLimit = Math.min(limit, 10);
    const language = /[\u3400-\u9fff]/u.test(query) ? 'zh' : 'en';
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: String(maxLimit),
      gsrnamespace: '0',
      prop: 'extracts|info',
      exintro: '1',
      explaintext: '1',
      exchars: '500',
      inprop: 'url',
      redirects: '1',
      format: 'json',
      formatversion: '2',
      origin: '*',
    }).toString();

    const res = await fetch(url, {
      headers: {
        'User-Agent': WIKIMEDIA_USER_AGENT,
        'Api-User-Agent': WIKIMEDIA_USER_AGENT,
        'Accept': 'application/json',
      },
      signal: withTimeout(options?.signal, 10000),
    });

    if (!res.ok) {
      if (res.status === 429 && options?.throwOnError) {
        throw new EngineAdapterError(
          'rate_limited',
          'Wikipedia HTTP 429 rate limit',
          {
            retryable: false,
            cooldownMs: 60_000,
            suggestion: 'Wait for the provider cooldown before retrying',
          },
        );
      }
      if (options?.throwOnError) throw new Error(`Wikipedia HTTP ${res.status}`);
      console.error(`Wikipedia: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as WikipediaQueryResponse;
    const pages = Array.isArray(data.query?.pages)
      ? [...data.query.pages].sort((left, right) =>
        (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER))
      : [];

    return pages
      .filter((page): page is WikipediaPage & {
        title: string;
        extract: string;
        fullurl: string;
      } =>
        typeof page.title === 'string'
        && typeof page.extract === 'string'
        && page.extract.trim().length > 0
        && typeof page.fullurl === 'string')
      .slice(0, maxLimit)
      .map(page => ({
        title: page.title,
        url: page.fullurl,
        snippet: page.extract.trim(),
        source: 'wikipedia',
        engines: ['wikipedia'],
      }));
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.error('Wikipedia: Search timed out');
    } else {
      console.error('Wikipedia search failed:', msg.slice(0, 200));
    }
    return [];
  }
}
