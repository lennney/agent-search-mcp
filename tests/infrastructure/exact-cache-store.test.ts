import * as fs from 'node:fs';
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchCache } from '../../src/infrastructure/cache.js';
import {
  FileExactCacheStore,
  MemoryExactCacheStore,
} from '../../src/infrastructure/exact-cache-store.js';

vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
}));

const temporaryDirectories: string[] = [];

function temporaryCacheDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agent-search-exact-cache-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
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

  function freezeFileWriteTimes(now: number): void {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      rename(from, to);
      // Reproduce filesystem timestamp ties without sleeps or platform assumptions.
      utimesSync(to, new Date(now), new Date(now));
    });
  }

  it('retains the newest writes when filesystem timestamps tie, including after reopening', () => {
    const now = Date.now();
    freezeFileWriteTimes(now);
    const directory = temporaryCacheDirectory();
    for (let index = 0; index < 100; index++) {
      // Each writer must recover recency from disk, not an in-memory counter.
      const store = new FileExactCacheStore(directory, { maxSize: 20 });
      store.set(`key-${index}`, { data: index, expiry: now + 60_000 });
    }
    const reader = new FileExactCacheStore(directory, { maxSize: 20 });
    expect(reader.size()).toBe(20);
    for (let index = 80; index < 100; index++) {
      expect(reader.get(`key-${index}`, now)?.data).toBe(index);
    }
  });

  it('keeps read recency when writes tie or the wall clock moves backwards', () => {
    const now = Date.now();
    freezeFileWriteTimes(now);
    const directory = temporaryCacheDirectory();
    const store = new FileExactCacheStore(directory, { maxSize: 2 });
    const expiry = now + 60_000;
    store.set('a', { data: 'a', expiry });
    store.set('b', { data: 'b', expiry });
    expect(store.get('a', now - 1_000)?.data).toBe('a');
    const reopened = new FileExactCacheStore(directory, { maxSize: 2 });
    reopened.set('c', { data: 'c', expiry });
    expect(reopened.size()).toBe(2);
    expect(reopened.get('b', now)).toBeNull();
    expect(reopened.get('a', now)?.data).toBe('a');
    expect(reopened.get('c', now)?.data).toBe('c');
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
