interface LocalizedText {
  en: string;
  zh: string;
}

export type ProviderAccess = 'zero-key' | 'optional-api';
export type WaterfallPhase = 'phase1a' | 'phase1b' | 'phase1c';

/**
 * Static provider facts. Runtime executors are attached in runtime-registry.ts
 * so importing shared types never initializes every adapter.
 */
export const providerCatalog = {
  duckduckgo: {
    id: 'duckduckgo', name: 'DuckDuckGo', access: 'zero-key', isFree: true,
    languages: ['en'], family: 'bing', weight: 0.85, waterfallPhase: 'phase1a',
    credentialEnvironment: undefined,
    strengths: { en: 'General Web Search', zh: '通用网页搜索' },
  },
  sogou: {
    id: 'sogou', name: 'Sogou Search', access: 'zero-key', isFree: true,
    languages: ['zh'], family: 'sogou', weight: 0.8, waterfallPhase: 'phase1a',
    credentialEnvironment: undefined,
    strengths: { en: 'Chinese Web Search', zh: '中文网页搜索' },
  },
  bing: {
    id: 'bing', name: 'Bing', access: 'zero-key', isFree: true,
    languages: ['en', 'zh'], family: 'bing', weight: 0.9, waterfallPhase: 'phase1b',
    credentialEnvironment: undefined,
    strengths: { en: 'Multilingual Web Search', zh: '多语言网页搜索' },
  },
  baidu: {
    id: 'baidu', name: 'Baidu', access: 'zero-key', isFree: true,
    languages: ['zh'], family: 'baidu', weight: 0.75, waterfallPhase: 'phase1b',
    credentialEnvironment: undefined,
    strengths: { en: 'Chinese Web Search', zh: '中文网页搜索' },
  },
  wikipedia: {
    id: 'wikipedia', name: 'Wikipedia', access: 'zero-key', isFree: true,
    languages: ['en', 'zh', 'ja', 'de', 'fr', 'es', 'auto'], family: 'wikipedia',
    weight: 0.93, waterfallPhase: 'phase1c',
    credentialEnvironment: undefined,
    strengths: { en: 'Encyclopedic references', zh: '百科参考资料' },
  },
  startpage: {
    id: 'startpage', name: 'Startpage', access: 'zero-key', isFree: true,
    languages: ['en', 'auto'], family: 'google', weight: 0.86, waterfallPhase: 'phase1c',
    credentialEnvironment: undefined,
    strengths: { en: 'Privacy-oriented Web Search', zh: '隐私导向网页搜索' },
  },
  yandex: {
    id: 'yandex', name: 'Yandex', access: 'zero-key', isFree: true,
    languages: ['ru', 'en', 'auto'], family: 'yandex', weight: 0.82, waterfallPhase: 'phase1c',
    credentialEnvironment: undefined,
    strengths: { en: 'Russian and international Web Search', zh: '俄语及国际网页搜索' },
  },
  mojeek: {
    id: 'mojeek', name: 'Mojeek', access: 'zero-key', isFree: true,
    languages: ['en', 'auto'], family: 'mojeek', weight: 0.8, waterfallPhase: 'phase1c',
    credentialEnvironment: undefined,
    strengths: { en: 'Independent privacy-oriented index', zh: '独立隐私导向索引' },
  },
  wiby: {
    id: 'wiby', name: 'Wiby', access: 'zero-key', isFree: true,
    languages: ['en'], family: 'wiby', weight: 0.78, waterfallPhase: 'phase1c',
    credentialEnvironment: undefined,
    strengths: { en: 'Independent small-Web index', zh: '独立小型网页索引' },
  },
  brave: {
    id: 'brave', name: 'Brave Search', access: 'optional-api', isFree: false,
    languages: ['en', 'zh'], family: 'brave', weight: 0.95,
    credentialEnvironment: 'BRAVE_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional commercial Web Search', zh: '可选商业网页搜索' },
  },
  tavily: {
    id: 'tavily', name: 'Tavily Search', access: 'optional-api', isFree: false,
    languages: ['en', 'zh'], family: 'tavily', weight: 0.9,
    credentialEnvironment: 'TAVILY_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional agent-oriented Search', zh: '可选 Agent 导向搜索' },
  },
  exa: {
    id: 'exa', name: 'Exa Search', access: 'optional-api', isFree: false,
    languages: ['en', 'zh'], family: 'exa', weight: 0.92,
    credentialEnvironment: 'EXA_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional neural Search', zh: '可选神经语义搜索' },
  },
  youcom: {
    id: 'youcom', name: 'You.com Search', access: 'optional-api', isFree: false,
    languages: ['en', 'zh'], family: 'youcom', weight: 0.91,
    credentialEnvironment: 'YDC_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional commercial Web Search', zh: '可选商业网页搜索' },
  },
  tencent_wsa: {
    id: 'tencent_wsa', name: 'Tencent Web Search API', access: 'optional-api', isFree: false,
    languages: ['zh'], family: 'sogou', weight: 0.9,
    credentialEnvironment: 'TENCENT_WSA_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional official Chinese Web Search', zh: '可选官方中文联网搜索' },
  },
  bocha: {
    id: 'bocha', name: 'Bocha Web Search', access: 'optional-api', isFree: false,
    languages: ['zh', 'en'], family: 'bocha', weight: 0.9,
    credentialEnvironment: 'BOCHA_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional Chinese-first AI Search', zh: '可选中文优先 AI 搜索' },
  },
  serper: {
    id: 'serper', name: 'Serper Google Search', access: 'optional-api', isFree: false,
    languages: ['en', 'zh', 'auto'], family: 'google', weight: 0.9,
    credentialEnvironment: 'SERPER_API_KEY',
    waterfallPhase: undefined,
    strengths: { en: 'Optional Google SERP Search', zh: '可选 Google SERP 搜索' },
  },
} as const;

export type SearchProvider = keyof typeof providerCatalog;

export interface SearchProviderInfo {
  id: SearchProvider;
  name: string;
  isFree: boolean;
  languages: readonly string[];
}

export interface EngineCapability extends SearchProviderInfo {
  access: ProviderAccess;
  credentialEnvironment?: string;
  family: string;
  strengths: LocalizedText;
  waterfallPhase?: WaterfallPhase;
  weight: number;
}

export const SEARCH_PROVIDERS = Object.freeze(
  Object.keys(providerCatalog) as SearchProvider[],
) as readonly [SearchProvider, ...SearchProvider[]];

export const freeEngines: readonly SearchProvider[] = SEARCH_PROVIDERS.filter(
  provider => providerCatalog[provider].access === 'zero-key',
);

export const paidEngines: readonly SearchProvider[] = SEARCH_PROVIDERS.filter(
  provider => providerCatalog[provider].access === 'optional-api',
);

export const ENGINE_WEIGHTS = Object.freeze(Object.fromEntries(
  SEARCH_PROVIDERS.map(provider => [provider, providerCatalog[provider].weight]),
)) as Readonly<Record<SearchProvider, number>>;

export const PROVIDER_FAMILIES = Object.freeze(Object.fromEntries(
  SEARCH_PROVIDERS.map(provider => [provider, providerCatalog[provider].family]),
)) as Readonly<Record<SearchProvider, string>>;

export const WATERFALL_PHASES = Object.freeze({
  phase1a: Object.freeze(SEARCH_PROVIDERS.filter(
    provider => providerCatalog[provider].waterfallPhase === 'phase1a',
  )),
  phase1b: Object.freeze(SEARCH_PROVIDERS.filter(
    provider => providerCatalog[provider].waterfallPhase === 'phase1b',
  )),
  phase1c: Object.freeze(SEARCH_PROVIDERS.filter(
    provider => providerCatalog[provider].waterfallPhase === 'phase1c',
  )),
}) satisfies Readonly<Record<WaterfallPhase, readonly SearchProvider[]>>;

export const optionalEngineCredentialEnvironment = Object.freeze(Object.fromEntries(
  paidEngines.map(provider => [
    provider,
    providerCatalog[provider].credentialEnvironment,
  ]),
)) as Readonly<Partial<Record<SearchProvider, string>>>;

export function hasEngineCredential(
  engine: SearchProvider,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const environmentName = optionalEngineCredentialEnvironment[engine];
  if (!environmentName) return true;
  return Boolean(environment[environmentName]?.trim());
}
