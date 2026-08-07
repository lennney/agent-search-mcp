import type { EngineSearchOptions, SearchResult } from '../types.js';
import { searchBaidu } from './baidu.js';
import { searchBing } from './bing.js';
import { searchBocha } from './bocha.js';
import { BraveProvider } from './brave.js';
import { searchDuckDuckGo } from './duckduckgo.js';
import { searchExa } from './exa.js';
import { searchMojeek } from './mojeek.js';
import {
  SEARCH_PROVIDERS,
  providerCatalog,
  type EngineCapability,
  type SearchProvider,
} from './provider-catalog.js';
import { searchSerper } from './serper.js';
import { searchSogou } from './sogou.js';
import { searchStartpage } from './startpage.js';
import { TavilyProvider } from './tavily.js';
import { searchTencentWsa } from './tencent-wsa.js';
import { searchWikipedia } from './wikipedia.js';
import { searchWiby } from './wiby.js';
import { searchYandex } from './yandex.js';
import { searchYouCom } from './youcom.js';

export type ProviderSearch = (
  query: string,
  count: number,
  options?: EngineSearchOptions,
) => Promise<SearchResult[]>;

export interface ProviderRuntimeDescriptor extends EngineCapability {
  search: ProviderSearch;
}

const providerExecutors = {
  duckduckgo: searchDuckDuckGo,
  sogou: searchSogou,
  bing: searchBing,
  baidu: searchBaidu,
  wikipedia: searchWikipedia,
  startpage: searchStartpage,
  yandex: searchYandex,
  mojeek: searchMojeek,
  wiby: searchWiby,
  brave: (query, count, options) => new BraveProvider().search(query, count, options),
  tavily: (query, count, options) => new TavilyProvider().search(query, count, options),
  exa: (query, count, options) => searchExa({
    query,
    count,
    apiKey: process.env.EXA_API_KEY || '',
    signal: options?.signal,
    throwOnError: options?.throwOnError,
  }),
  youcom: searchYouCom,
  tencent_wsa: searchTencentWsa,
  bocha: searchBocha,
  serper: searchSerper,
} satisfies Record<SearchProvider, ProviderSearch>;

/**
 * Runtime projection of the static catalog. The catalog owns provider facts;
 * this module is the only owner of adapter invocation bindings.
 */
export const providerRuntimeRegistry = Object.freeze(Object.fromEntries(
  SEARCH_PROVIDERS.map(provider => [
    provider,
    Object.freeze({
      ...providerCatalog[provider],
      search: providerExecutors[provider],
    }),
  ]),
)) as unknown as Readonly<Record<SearchProvider, ProviderRuntimeDescriptor>>;

export function searchProvider(
  provider: SearchProvider,
  query: string,
  count: number,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  return providerRuntimeRegistry[provider].search(query, count, options);
}
