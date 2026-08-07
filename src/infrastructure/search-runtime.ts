import { searchProvider } from '../engines/runtime-registry.js';
import type { EngineSearchOptions, SearchProvider, SearchResult } from '../types.js';
import { SearchCache } from './cache.js';
import { loadConfig, type Config } from './config.js';
import { createExactCacheStore } from './exact-cache-store.js';
import { HealthTracker, ServerMetrics } from './health.js';
import { createProviderCooldownStore } from './provider-cooldown-store.js';
import { RateLimiter } from './rate-limiter.js';
import { isSearchResponseCacheValue } from './search-cache-policy.js';
import { EnginePolicy } from './tool-policy.js';

export interface SearchCachePort {
  get(key: string): unknown | null;
  set(key: string, data: unknown): void;
  stats(): {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
  };
}

export type HealthTrackerPort = Pick<
  HealthTracker,
  | 'getAvailability'
  | 'getHealth'
  | 'isHealthy'
  | 'recordFailure'
  | 'recordSuccess'
  | 'suspend'
>;

export type ServerMetricsPort = Pick<ServerMetrics, 'getMetrics' | 'recordRequest'>;
export type RateLimiterPort = Pick<RateLimiter, 'getAllRateLimits' | 'waitForSlot'>;
export type EnginePolicyPort = Pick<EnginePolicy, 'isAllowed'>;

export type ProviderSearchDispatcher = (
  provider: SearchProvider,
  query: string,
  count: number,
  options?: EngineSearchOptions,
) => Promise<SearchResult[]>;

/**
 * Mutable state and outbound provider execution owned by one server/runtime.
 * Callers inject this object instead of coordinating module-level globals.
 */
export interface SearchRuntime {
  config: Config;
  cache: SearchCachePort;
  healthTracker: HealthTrackerPort;
  serverMetrics: ServerMetricsPort;
  rateLimiter: RateLimiterPort;
  enginePolicy: EnginePolicyPort;
  searchProvider: ProviderSearchDispatcher;
}

export interface SearchRuntimeOverrides {
  config?: Config;
  cache?: SearchCachePort;
  healthTracker?: HealthTrackerPort;
  serverMetrics?: ServerMetricsPort;
  rateLimiter?: RateLimiterPort;
  enginePolicy?: EnginePolicyPort;
  searchProvider?: ProviderSearchDispatcher;
}

export function createSearchRuntime(
  overrides: SearchRuntimeOverrides = {},
): SearchRuntime {
  const config = overrides.config ?? loadConfig();
  const cache = overrides.cache ?? new SearchCache({
    maxSize: config.searchCacheMaxEntries,
    defaultTtlMs: config.searchCacheTtlMs,
    store: createExactCacheStore(
      config.searchCacheDirectory,
      config.searchCacheMaxEntries,
    ),
    validate: isSearchResponseCacheValue,
  });
  const healthTracker = overrides.healthTracker ?? new HealthTracker(
    createProviderCooldownStore(config.providerCooldownStorePath),
  );

  return {
    config,
    cache,
    healthTracker,
    serverMetrics: overrides.serverMetrics ?? new ServerMetrics(cache),
    rateLimiter: overrides.rateLimiter ?? new RateLimiter(),
    enginePolicy: overrides.enginePolicy
      ?? new EnginePolicy(config.ALLOWED_ENGINES, config.DENIED_ENGINES),
    searchProvider: overrides.searchProvider ?? searchProvider,
  };
}

let defaultRuntime: SearchRuntime | undefined;

/** Read environment-backed configuration only when the first caller needs it. */
export function getDefaultSearchRuntime(): SearchRuntime {
  defaultRuntime ??= createSearchRuntime();
  return defaultRuntime;
}
