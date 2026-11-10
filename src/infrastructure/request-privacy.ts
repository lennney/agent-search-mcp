import { AsyncLocalStorage } from 'node:async_hooks';

export type SearchPrivacy = 'standard' | 'no_retention';
const privacyContext = new AsyncLocalStorage<SearchPrivacy>();

/** Local retention only. Upstream search/enrichment services still receive requests. */
export function isNoRetention(): boolean {
  return privacyContext.getStore() === 'no_retention';
}

export function withSearchPrivacy<T>(privacy: SearchPrivacy, run: () => T): T {
  return privacyContext.run(privacy, run);
}
