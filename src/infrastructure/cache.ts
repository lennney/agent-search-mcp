export interface CacheEntry {
  data: any;
  expiry: number;
}

export interface SearchCacheOptions {
  maxSize?: number;
  defaultTtlMs?: number;
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
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(options: SearchCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    // LRU: move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.data;
  }

  set(key: string, data: any): void {
    this.setWithTtl(key, data, this.defaultTtlMs);
  }

  setWithTtl(key: string, data: any, ttlMs: number): void {
    // If key already exists, remove it first so re-insert tracks as new
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict: drop oldest entries until under maxSize
    while (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }

    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  /** Number of entries currently in the cache. */
  size(): number {
    return this.cache.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Hit/miss telemetry for cache tuning. */
  stats(): SearchCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  makeKey(query: string, count: number, engines: string[]): string {
    return `${query}:${count}:${[...engines].sort().join(',')}`;
  }
}
