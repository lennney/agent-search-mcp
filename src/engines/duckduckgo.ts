import { SearchResult, type EngineSearchOptions } from '../types.js';
import { logger } from '../infrastructure/logger.js';
import { searchDuckDuckGoHtml, searchDuckDuckGoNewsHtml } from './duckduckgo-html.js';
import { searchDuckDuckGoWeb } from './duckduckgo-web.js';
import { isEngineAdapterError } from './engine-error.js';

export const duckduckgoProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo',
  isFree: true,
  languages: ['en'],
};

/**
 * Search DuckDuckGo through native Node representations. The page-issued Web
 * preload is preferred over no-JS HTML/Lite because it binds the current query
 * and request identity without an external runtime or subprocess.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  options?.signal?.throwIfAborted();
  try {
    const results = await searchDuckDuckGoWeb(query, limit, {
      ...(options ?? {}),
      throwOnError: true,
    });
    if (results.length > 0) return results;
    logger.info('DDG Web representation returned no results; trying HTML/Lite');
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (isEngineAdapterError(error)
      && ['bot_challenge', 'validation_error'].includes(error.failureType)) {
      throw error;
    }
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'DDG Web representation failed; trying HTML/Lite',
    );
  }

  return options
    ? searchDuckDuckGoHtml(query, limit, options)
    : searchDuckDuckGoHtml(query, limit);
}

/**
 * Search DuckDuckGo News through the native HTML representation.
 */
export async function searchDuckduckgoNews(
  query: string,
  limit: number = 10,
  _timeRange: string = 'w',
): Promise<SearchResult[]> {
  return searchDuckDuckGoNewsHtml(query, limit);
}
