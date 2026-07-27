export interface SearchResponseCacheValue {
  query: string;
  engines: unknown[];
  results: unknown[];
  meta: {
    execution?: {
      stop_reason?: string;
    };
  };
  security_note: string;
}

export function isSearchResponseCacheValue(
  value: unknown,
): value is SearchResponseCacheValue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SearchResponseCacheValue>;
  return (
    typeof candidate.query === 'string' &&
    Array.isArray(candidate.engines) &&
    Array.isArray(candidate.results) &&
    typeof candidate.meta === 'object' &&
    candidate.meta !== null &&
    typeof candidate.security_note === 'string'
  );
}

export function isCacheableSearchResponse(
  value: SearchResponseCacheValue,
): boolean {
  return (
    value.results.length > 0 &&
    value.meta.execution?.stop_reason !== 'budget_exhausted'
  );
}
