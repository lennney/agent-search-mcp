import { SearchProvider, SearchProviderInfo } from '../types.js';

export { searchDuckDuckGo, duckduckgoProvider } from './duckduckgo.js';
export { searchSogou, sogouProvider } from './sogou.js';
export { braveProvider } from './brave.js';
export { tavilyProvider } from './tavily.js';

/**
 * All registered engine providers with metadata.
 * Free engines: DDG, Sogou
 * Paid engines: Brave, Tavily (require API keys)
 */
export const engines: Record<SearchProvider, SearchProviderInfo> = {
  duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', isFree: true, languages: ['en'] },
  sogou: { id: 'sogou', name: 'Sogou Search', isFree: true, languages: ['zh'] },
  brave: { id: 'brave', name: 'Brave Search', isFree: false, languages: ['en', 'zh'] },
  tavily: { id: 'tavily', name: 'Tavily Search', isFree: false, languages: ['en', 'zh'] },
};

/** Free engines that always work without API keys */
export const freeEngines: SearchProvider[] = ['duckduckgo', 'sogou'];

/** Paid engines that require API keys */
export const paidEngines: SearchProvider[] = ['brave', 'tavily'];
