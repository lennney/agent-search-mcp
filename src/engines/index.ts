import { SearchProvider, SearchProviderInfo } from '../types.js';

export { searchDuckDuckGo, duckduckgoProvider } from './duckduckgo.js';
export { searchSogou, sogouProvider } from './sogou.js';
export { searchBing, bingProvider } from './bing.js';
export { searchBaidu, baiduProvider } from './baidu.js';
export { braveProvider } from './brave.js';
export { tavilyProvider } from './tavily.js';
export { searchExa, exaProvider } from './exa.js';
export { searchWikipedia, wikipediaProvider } from './wikipedia.js';
export { searchStartpage, startpageProvider } from './startpage.js';
export { searchYandex, yandexProvider } from './yandex.js';
export { searchMojeek, mojeekProvider } from './mojeek.js';
export { searchYouCom, youcomProvider } from './youcom.js';

/**
 * All registered engine providers with metadata.
 * Free engines: DDG, Sogou, Bing, Baidu
 * Paid engines: Brave, Tavily, Exa, You.com (require API keys)
 */
export const engines: Record<SearchProvider, SearchProviderInfo> = {
  duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', isFree: true, languages: ['en'] },
  sogou: { id: 'sogou', name: 'Sogou Search', isFree: true, languages: ['zh'] },
  bing: { id: 'bing', name: 'Bing', isFree: true, languages: ['en', 'zh'] },
  baidu: { id: 'baidu', name: 'Baidu', isFree: true, languages: ['zh'] },
  wikipedia: { id: 'wikipedia', name: 'Wikipedia', isFree: true, languages: ['en', 'zh', 'ja', 'de', 'fr', 'es', 'auto'] },
  startpage: { id: 'startpage', name: 'Startpage', isFree: true, languages: ['en', 'auto'] },
  yandex: { id: 'yandex', name: 'Yandex', isFree: true, languages: ['ru', 'en', 'auto'] },
  mojeek: { id: 'mojeek', name: 'Mojeek', isFree: true, languages: ['en', 'auto'] },
  brave: { id: 'brave', name: 'Brave Search', isFree: false, languages: ['en', 'zh'] },
  tavily: { id: 'tavily', name: 'Tavily Search', isFree: false, languages: ['en', 'zh'] },
  exa: { id: 'exa', name: 'Exa Search', isFree: false, languages: ['en', 'zh'] },
  youcom: { id: 'youcom', name: 'You.com Search', isFree: false, languages: ['en', 'zh'] },
};

/** Free engines that always work without API keys */
export const freeEngines: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu', 'wikipedia', 'startpage', 'yandex', 'mojeek'];

/** Paid engines that require API keys */
export const paidEngines: SearchProvider[] = ['brave', 'tavily', 'exa', 'youcom'];

/** Environment-variable provenance for optional API adapters. */
export const optionalEngineCredentialEnvironment: Readonly<
  Partial<Record<SearchProvider, string>>
> = {
  brave: 'BRAVE_API_KEY',
  tavily: 'TAVILY_API_KEY',
  exa: 'EXA_API_KEY',
  youcom: 'YDC_API_KEY',
};

export function hasEngineCredential(
  engine: SearchProvider,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const environmentName = optionalEngineCredentialEnvironment[engine];
  if (!environmentName) return true;
  return Boolean(environment[environmentName]?.trim());
}
