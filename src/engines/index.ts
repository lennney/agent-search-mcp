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
export { searchWiby, wibyProvider } from './wiby.js';
export { searchYouCom, youcomProvider } from './youcom.js';
export {
  searchTencentWsa,
  tencentWsaProvider,
} from './tencent-wsa.js';
export { searchBocha, bochaProvider } from './bocha.js';
export { searchSerper, serperProvider } from './serper.js';

interface LocalizedText {
  en: string;
  zh: string;
}

export interface EngineCapability extends SearchProviderInfo {
  credentialEnvironment?: string;
  strengths: LocalizedText;
}

/**
 * All registered engine providers with metadata.
 * Access groups and credential provenance are derived from this registry.
 */
export const engines: Record<SearchProvider, EngineCapability> = {
  duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', isFree: true, languages: ['en'], strengths: { en: 'General Web Search', zh: '通用网页搜索' } },
  sogou: { id: 'sogou', name: 'Sogou Search', isFree: true, languages: ['zh'], strengths: { en: 'Chinese Web Search', zh: '中文网页搜索' } },
  bing: { id: 'bing', name: 'Bing', isFree: true, languages: ['en', 'zh'], strengths: { en: 'Multilingual Web Search', zh: '多语言网页搜索' } },
  baidu: { id: 'baidu', name: 'Baidu', isFree: true, languages: ['zh'], strengths: { en: 'Chinese Web Search', zh: '中文网页搜索' } },
  wikipedia: { id: 'wikipedia', name: 'Wikipedia', isFree: true, languages: ['en', 'zh', 'ja', 'de', 'fr', 'es', 'auto'], strengths: { en: 'Encyclopedic references', zh: '百科参考资料' } },
  startpage: { id: 'startpage', name: 'Startpage', isFree: true, languages: ['en', 'auto'], strengths: { en: 'Privacy-oriented Web Search', zh: '隐私导向网页搜索' } },
  yandex: { id: 'yandex', name: 'Yandex', isFree: true, languages: ['ru', 'en', 'auto'], strengths: { en: 'Russian and international Web Search', zh: '俄语及国际网页搜索' } },
  mojeek: { id: 'mojeek', name: 'Mojeek', isFree: true, languages: ['en', 'auto'], strengths: { en: 'Independent privacy-oriented index', zh: '独立隐私导向索引' } },
  wiby: { id: 'wiby', name: 'Wiby', isFree: true, languages: ['en'], strengths: { en: 'Independent small-Web index', zh: '独立小型网页索引' } },
  brave: { id: 'brave', name: 'Brave Search', isFree: false, languages: ['en', 'zh'], credentialEnvironment: 'BRAVE_API_KEY', strengths: { en: 'Optional commercial Web Search', zh: '可选商业网页搜索' } },
  tavily: { id: 'tavily', name: 'Tavily Search', isFree: false, languages: ['en', 'zh'], credentialEnvironment: 'TAVILY_API_KEY', strengths: { en: 'Optional agent-oriented Search', zh: '可选 Agent 导向搜索' } },
  exa: { id: 'exa', name: 'Exa Search', isFree: false, languages: ['en', 'zh'], credentialEnvironment: 'EXA_API_KEY', strengths: { en: 'Optional neural Search', zh: '可选神经语义搜索' } },
  youcom: { id: 'youcom', name: 'You.com Search', isFree: false, languages: ['en', 'zh'], credentialEnvironment: 'YDC_API_KEY', strengths: { en: 'Optional commercial Web Search', zh: '可选商业网页搜索' } },
  tencent_wsa: { id: 'tencent_wsa', name: 'Tencent Web Search API', isFree: false, languages: ['zh'], credentialEnvironment: 'TENCENT_WSA_API_KEY', strengths: { en: 'Optional official Chinese Web Search', zh: '可选官方中文联网搜索' } },
  bocha: { id: 'bocha', name: 'Bocha Web Search', isFree: false, languages: ['zh', 'en'], credentialEnvironment: 'BOCHA_API_KEY', strengths: { en: 'Optional Chinese-first AI Search', zh: '可选中文优先 AI 搜索' } },
  serper: { id: 'serper', name: 'Serper Google Search', isFree: false, languages: ['en', 'zh', 'auto'], credentialEnvironment: 'SERPER_API_KEY', strengths: { en: 'Optional Google SERP Search', zh: '可选 Google SERP 搜索' } },
};

/** Free engines that always work without API keys */
export const freeEngines = Object.values(engines)
  .filter(engine => engine.isFree)
  .map(engine => engine.id);

/** Paid engines that require API keys */
export const paidEngines = Object.values(engines)
  .filter(engine => !engine.isFree)
  .map(engine => engine.id);

/** Environment-variable provenance for optional API adapters. */
export const optionalEngineCredentialEnvironment = Object.fromEntries(
  Object.values(engines)
    .filter(engine => engine.credentialEnvironment)
    .map(engine => [engine.id, engine.credentialEnvironment]),
) as Readonly<Partial<Record<SearchProvider, string>>>;

export function hasEngineCredential(
  engine: SearchProvider,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const environmentName = optionalEngineCredentialEnvironment[engine];
  if (!environmentName) return true;
  return Boolean(environment[environmentName]?.trim());
}
