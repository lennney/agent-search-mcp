import { detectLanguage } from '../aggregation/language-detector.js';

export type SearchLanguage = 'en' | 'zh';
export type SearchRegion = 'us-en' | 'cn-zh';

export interface SearchRequestContext {
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
): SearchRequestContext {
  const detected = preference === 'en' || preference === 'zh'
    ? preference
    : detectLanguage(query);
  return detected === 'zh'
    ? SEARCH_REQUEST_PROFILES.zh
    : SEARCH_REQUEST_PROFILES.en;
}
