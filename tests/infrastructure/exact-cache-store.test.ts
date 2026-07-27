import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SearchCache } from '../../src/infrastructure/cache.js';
import {
  FileExactCacheStore,
  MemoryExactCacheStore,
} from '../../src/infrastructure/exact-cache-store.js';

const temporaryDirectories: string[] = [];

function temporaryCacheDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agent-search-exact-cache-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ExactCacheStore', () => {
  it('reuses a fresh exact entry across store instances', () => {
    const directory = temporaryCacheDirectory();
    const expiry = Date.now() + 60_000;
    const first = new FileExactCacheStore(directory, { maxSize: 10 });
    first.set('key', { data: { results: [1] }, expiry });

    const second = new FileExactCacheStore(directory, { maxSize: 10 });
    expect(second.get('key', Date.now())).toEqual({
      data: { results: [1] },
      expiry,
    });
  });

  it('never reuses stale entries', () => {
    const directory = temporaryCacheDirectory();
    const store = new FileExactCacheStore(directory, { maxSize: 10 });
    store.set('stale', { data: 'old', expiry: 100 });

    expect(store.get('stale', 100)).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('fails open and removes corrupt entries', () => {
    const directory = temporaryCacheDirectory();
    const store = new FileExactCacheStore(directory, { maxSize: 10 });
    store.set('broken', { data: 'value', expiry: Date.now() + 60_000 });
    const [path] = readdirSync(directory)
      .filter(name => name.endsWith('.exact-cache.json'));
    writeFileSync(join(directory, path), '{bad-json');

    expect(store.get('broken', Date.now())).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('bounds file count with LRU-style eviction', () => {
    const directory = temporaryCacheDirectory();
    const store = new FileExactCacheStore(directory, { maxSize: 2 });
    const expiry = Date.now() + 60_000;
    store.set('a', { data: 'a', expiry });
    store.set('b', { data: 'b', expiry });
    store.get('a', Date.now() + 1_000);
    store.set('c', { data: 'c', expiry });

    expect(store.size()).toBe(2);
    expect(store.get('a', Date.now())?.data).toBe('a');
    expect(store.get('c', Date.now())?.data).toBe('c');
  });

  it('rejects oversized entries without breaking the caller', () => {
    const directory = temporaryCacheDirectory();
    const store = new FileExactCacheStore(directory, {
      maxSize: 10,
      maxFileBytes: 100,
    });
    expect(() => store.set('large', {
      data: 'x'.repeat(1_000),
      expiry: Date.now() + 60_000,
    })).not.toThrow();
    expect(store.size()).toBe(0);
  });

  it('lets SearchCache reject invalid durable payloads through its interface', () => {
    const store = new MemoryExactCacheStore(10);
    store.set('bad', { data: { wrong: true }, expiry: Date.now() + 60_000 });
    const cache = new SearchCache({
      store,
      validate: value => (
        !!value
        && typeof value === 'object'
        && Array.isArray((value as { results?: unknown }).results)
      ),
    });

    expect(cache.get('bad')).toBeNull();
    expect(cache.stats()).toMatchObject({ hits: 0, misses: 1, size: 0 });
  });

  it('clear removes only exact-cache files from the configured directory', () => {
    const directory = temporaryCacheDirectory();
    writeFileSync(join(directory, 'keep.txt'), 'keep');
    const store = new FileExactCacheStore(directory, { maxSize: 10 });
    store.set('cache', { data: 'value', expiry: Date.now() + 60_000 });
    store.clear();

    expect(readdirSync(directory)).toEqual(['keep.txt']);
  });
});
