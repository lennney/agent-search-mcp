import {
  MemoryExactCacheStore,
  type ExactCacheStore,
} from './exact-cache-store.js';

export interface SearchCacheOptions {
  maxSize?: number;
  defaultTtlMs?: number;
  store?: ExactCacheStore;
  validate?: (value: unknown) => boolean;
}

export interface SearchCacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

/**
 * LRU cache with TTL support, designed for lightweight VPS.
 *
 * - Entries are tracked in insertion/access order for LRU eviction.
 * - TTL is enforced on get(); stale entries are lazily purged.
 * - No background timers — memory-safe for long-running server processes.
 * - stats() provides hit/miss telemetry for cache tuning.
 */
export class SearchCache {
  private readonly store: ExactCacheStore;
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly validate?: (value: unknown) => boolean;
  private hits = 0;
  private misses = 0;

  constructor(options: SearchCacheOptions = {}) {
    this.maxSize = Math.max(1, options.maxSize ?? 1000);
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.store = options.store ?? new MemoryExactCacheStore(this.maxSize);
    this.validate = options.validate;
  }

  get(key: string): unknown | null {
    const entry = this.store.get(key, Date.now());
    if (!entry) {
      this.misses++;
      return null;
    }
    if (this.validate && !this.validate(entry.data)) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.data;
  }

  set(key: string, data: unknown): void {
    this.setWithTtl(key, data, this.defaultTtlMs);
  }

  setWithTtl(key: string, data: unknown, ttlMs: number): void {
    if (this.validate && !this.validate(data)) return;
    this.store.set(key, { data, expiry: Date.now() + ttlMs });
  }

  /** Number of entries currently in the cache. */
  size(): number {
    return this.store.size();
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Hit/miss telemetry for cache tuning. */
  stats(): SearchCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size(),
      maxSize: this.maxSize,
    };
  }

  makeKey(query: string, count: number, engines: string[]): string {
    return `${query}:${count}:${[...engines].sort().join(',')}`;
  }
}
