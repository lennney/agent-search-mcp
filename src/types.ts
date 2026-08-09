import type { SearchRequestContext } from './engines/search-request-context.js';

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
  /** Stable language and region context resolved once by the orchestrator. */
  requestContext?: SearchRequestContext;
}

export { SEARCH_PROVIDERS } from './engines/provider-catalog.js';
export type {
  SearchProvider,
  SearchProviderInfo,
} from './engines/provider-catalog.js';

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
