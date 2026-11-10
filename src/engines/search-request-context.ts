import { detectLanguage } from '../aggregation/language-detector.js';

export type SearchLanguage = 'en' | 'zh';
export type SearchMarket = 'US' | 'CN' | 'MY' | 'SG';
export type SearchRegion = 'us-en' | 'cn-zh' | 'my-en' | 'sg-en';

// DDG official region URL parameters, verified 2026-11-10:
// https://duckduckgo.com/duckduckgo-help-pages/settings/params/
const MARKET_REGIONS: Readonly<Record<SearchMarket, SearchRegion>> = Object.freeze({
  US: 'us-en', CN: 'cn-zh', MY: 'my-en', SG: 'sg-en',
});

export interface SearchRequestContext {
  readonly market?: SearchMarket;
  readonly language: SearchLanguage;
  readonly region: SearchRegion;
  readonly acceptLanguage: string;
}

const SEARCH_REQUEST_PROFILES: Readonly<
  Record<SearchLanguage, SearchRequestContext>
> = Object.freeze({
  en: Object.freeze({
    language: 'en',
    region: 'us-en',
    acceptLanguage: 'en-US,en;q=0.9',
  }),
  zh: Object.freeze({
    language: 'zh',
    region: 'cn-zh',
    acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
  }),
});

/** Resolve one stable bilingual context for a complete logical search. */
export function resolveSearchRequestContext(
  query: string,
  preference?: string,
  market?: SearchMarket,
): SearchRequestContext {
  const detected = preference === 'en' || preference === 'zh'
    ? preference
    : detectLanguage(query);
  const context = detected === 'zh'
    ? SEARCH_REQUEST_PROFILES.zh
    : SEARCH_REQUEST_PROFILES.en;
  if (market === undefined) return context;
  if (!Object.hasOwn(MARKET_REGIONS, market)) {
    throw new Error('Unsupported search market; supported markets: US, CN, MY, SG');
  }
  return Object.freeze({ ...context, market, region: MARKET_REGIONS[market] });
}
