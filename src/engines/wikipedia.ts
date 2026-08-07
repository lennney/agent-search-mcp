import { SearchResult, type EngineSearchOptions } from '../types.js';
import { withTimeout } from '../infrastructure/abort.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';
import { logger } from '../infrastructure/logger.js';
import { EngineAdapterError } from './engine-error.js';
import { providerCatalog } from './provider-catalog.js';

const WIKIMEDIA_USER_AGENT =
  'agent-search-mcp/3.x (https://github.com/lennney/agent-search-mcp)';

export const wikipediaProvider = providerCatalog.wikipedia;

interface WikipediaPage {
  index?: number;
  title?: string;
  extract?: string;
  snippet?: string;
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
      gsrprop: 'snippet',
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
      logger.warn({ status: res.status }, 'Wikipedia HTTP error');
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
        fullurl: string;
      } =>
        typeof page.title === 'string'
        && typeof page.fullurl === 'string'
        && (
          (typeof page.snippet === 'string' && page.snippet.trim().length > 0)
          || (typeof page.extract === 'string' && page.extract.trim().length > 0)
        ))
      .slice(0, maxLimit)
      .map(page => {
        const matchedSnippet = typeof page.snippet === 'string'
          ? decodeHTMLTags(page.snippet).replace(/\s+/g, ' ').trim()
          : '';
        const articleExtract = typeof page.extract === 'string'
          ? page.extract.trim()
          : '';
        return {
          title: page.title,
          url: page.fullurl,
          snippet: matchedSnippet || articleExtract,
          source: 'wikipedia',
          engines: ['wikipedia'],
        };
      });
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      logger.warn('Wikipedia search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'Wikipedia search failed');
    }
    return [];
  }
}
