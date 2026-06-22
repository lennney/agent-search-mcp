interface CacheEntry {
  data: any;
  expiry: number;
}

export class SearchCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;
  private ttl = 60_000;

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { data, expiry: Date.now() + this.ttl });
  }

  makeKey(query: string, count: number, engines: string[]): string {
    return `${query}:${count}:${engines.sort().join(',')}`;
  }
}
