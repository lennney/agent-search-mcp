export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  engines?: string[];  // populated by aggregation layer, or set by single-engine searches
}

export type SearchProvider = 'duckduckgo' | 'sogou' | 'brave' | 'tavily' | 'bing' | 'baidu' | 'exa' | 'wikipedia' | 'startpage' | 'yandex' | 'mojeek' | 'youcom';

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
  type: 'validation_error' | 'timeout' | 'upstream_4xx' | 'upstream_5xx' | 'rate_limited' | 'permission_denied' | 'unknown';
  message: string;
  suggestion: string;
}
