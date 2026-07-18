import { describe, it, expect, beforeEach } from 'vitest';
import { SearchCache } from '../../src/infrastructure/cache.js';

describe('SearchCache', () => {
  let cache: SearchCache;

  beforeEach(() => {
    cache = new SearchCache({ maxSize: 10, defaultTtlMs: 60_000 });
  });

  it('stores and retrieves a value', () => {
    cache.set('key1', { data: 42 });
    expect(cache.get('key1')).toEqual({ data: 42 });
  });

  it('returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns null for expired entry', async () => {
    const shortCache = new SearchCache({ maxSize: 10, defaultTtlMs: 10 });
    shortCache.set('quick', 'value');
    await new Promise(r => setTimeout(r, 20));
    expect(shortCache.get('quick')).toBeNull();
  });

  it('evicts oldest on overflow (LRU: evict least recently used)', () => {
    const small = new SearchCache({ maxSize: 3, defaultTtlMs: 60_000 });
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3);
    // Access 'a' to make it recently used
    small.get('a');
    // Now set 'd' — should evict 'b' (next oldest after 'a' was accessed)
    small.set('d', 4);
    expect(small.get('a')).toBe(1);  // recently accessed, kept
    expect(small.get('b')).toBeNull(); // evicted
    expect(small.get('c')).toBe(3);
    expect(small.get('d')).toBe(4);
  });

  it('expired entries are removed on get', () => {
    const ttlCache = new SearchCache({ maxSize: 10, defaultTtlMs: -1 }); // already expired
    ttlCache.set('stale', 'data');
    expect(ttlCache.get('stale')).toBeNull();
  });

  it('entries with custom TTL via setWithTtl override default', async () => {
    const custom = new SearchCache({ maxSize: 10, defaultTtlMs: 60_000 });
    custom.setWithTtl('ephemeral', 'gone', 10);
    custom.setWithTtl('persistent', 'here', 10_000);
    await new Promise(r => setTimeout(r, 20));
    expect(custom.get('ephemeral')).toBeNull();
    expect(custom.get('persistent')).toBe('here');
  });

  it('makeKey produces deterministic keys', () => {
    const k1 = cache.makeKey('hello world', 10, ['ddg', 'brave']);
    const k2 = cache.makeKey('hello world', 10, ['brave', 'ddg']); // reversed order
    expect(k1).toBe(k2);
  });

  it('different queries produce different keys', () => {
    const k1 = cache.makeKey('hello', 5, ['ddg']);
    const k2 = cache.makeKey('world', 5, ['ddg']);
    expect(k1).not.toBe(k2);
  });

  it('size returns current entry count', () => {
    expect(cache.size()).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
    cache.get('expired-nonexistent'); // no side effect
    expect(cache.size()).toBe(2);
  });

  it('clear removes all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  it('stats tracks hits and misses', () => {
    cache.set('hit', 'yes');
    cache.get('hit');   // hit
    cache.get('hit');   // hit
    cache.get('miss');  // miss
    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });

  it('handles concurrent expiry + access race', async () => {
    const tight = new SearchCache({ maxSize: 5, defaultTtlMs: 5 });
    tight.set('race', 'value');
    await new Promise(r => setTimeout(r, 10));
    // Entry expired but not yet purged; get() should return null
    expect(tight.get('race')).toBeNull();
  });

  it('eviction drops oldest when full (no access pattern)', () => {
    const small = new SearchCache({ maxSize: 3, defaultTtlMs: 60_000 });
    small.set('x', 10);
    small.set('y', 20);
    small.set('z', 30);
    small.set('w', 40); // evicts 'x'
    expect(small.get('x')).toBeNull();
    expect(small.get('y')).toBe(20);
    expect(small.get('z')).toBe(30);
    expect(small.get('w')).toBe(40);
  });
});
