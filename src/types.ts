export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  engines?: string[];  // populated by aggregation layer, or set by single-engine searches
}

export type SearchProvider = 'duckduckgo' | 'sogou' | 'brave' | 'tavily' | 'bing' | 'baidu' | 'exa' | 'wikipedia' | 'startpage' | 'yandex' | 'mojeek';

export interface SearchProviderInfo {
  id: SearchProvider;
  name: string;
  isFree: boolean;
  languages: string[];
}
