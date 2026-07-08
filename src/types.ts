export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  engines?: string[];  // populated by aggregation layer, or set by single-engine searches
  similarityScore?: number;  // populated by semantic reranker
}

export type SearchProvider = 'duckduckgo' | 'sogou' | 'brave' | 'tavily' | 'bing' | 'baidu' | 'exa';

export interface SearchProviderInfo {
  id: SearchProvider;
  name: string;
  isFree: boolean;
  languages: string[];
}
