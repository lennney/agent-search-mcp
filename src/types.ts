export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  engines?: string[];  // populated by aggregation layer, or set by single-engine searches
  published_at?: string;
  extraction?: {
    kind: 'search_snippet' | 'reader_extracted';
    source_chars: number;
  };
}

export interface EngineSearchOptions {
  signal?: AbortSignal;
  /** Orchestrators set this to preserve upstream failures for partialFailures. */
  throwOnError?: boolean;
}

export const SEARCH_PROVIDERS = [
  'duckduckgo',
  'sogou',
  'bing',
  'baidu',
  'wikipedia',
  'startpage',
  'yandex',
  'mojeek',
  'wiby',
  'brave',
  'tavily',
  'exa',
  'youcom',
  'tencent_wsa',
  'bocha',
  'serper',
  'serpbase',
] as const;

export type SearchProvider = typeof SEARCH_PROVIDERS[number];

export interface SearchProviderInfo {
  id: SearchProvider;
  name: string;
  isFree: boolean;
  languages: string[];
}

/**
 * Structured engine error for agent-friendly error recovery.
 * Mirrors the Anti-Patterns Guide + Arcade.dev Error-Guided Recovery pattern.
 */
export interface EngineError {
  engine: string;
  type: 'validation_error' | 'parse_error' | 'timeout' | 'upstream_4xx' | 'upstream_5xx' | 'rate_limited' | 'bot_challenge' | 'permission_denied' | 'budget_exhausted' | 'unknown';
  message: string;
  suggestion: string;
}
