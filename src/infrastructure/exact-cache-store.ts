import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { logger } from './logger.js';

export interface ExactCacheEntry {
  data: unknown;
  expiry: number;
}

export interface ExactCacheStore {
  get(key: string, now: number): ExactCacheEntry | null;
  set(key: string, entry: ExactCacheEntry): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export class MemoryExactCacheStore implements ExactCacheStore {
  private readonly entries = new Map<string, ExactCacheEntry>();

  constructor(private readonly maxSize: number) {}

  get(key: string, now: number): ExactCacheEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiry <= now) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key: string, entry: ExactCacheEntry): void {
    this.entries.delete(key);
    while (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, entry);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

interface ExactCacheFile {
  schema_version: 'exact-search-cache-v1';
  key: string;
  expiry: number;
  data: unknown;
}

const CACHE_FILE_SUFFIX = '.exact-cache.json';

export interface FileExactCacheStoreOptions {
  maxSize: number;
  maxFileBytes?: number;
}

export class FileExactCacheStore implements ExactCacheStore {
  readonly directory: string;
  private readonly maxFileBytes: number;

  constructor(
    directory: string,
    private readonly options: FileExactCacheStoreOptions,
  ) {
    if (!directory.trim()) throw new Error('Exact cache directory must not be empty');
    this.directory = resolve(directory);
    this.maxFileBytes = options.maxFileBytes ?? 2_000_000;
  }

  get(key: string, now: number): ExactCacheEntry | null {
    const path = this.pathForKey(key);
    try {
      const stat = statSync(path);
      if (stat.size > this.maxFileBytes) {
        this.removeFile(path);
        return null;
      }
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      if (!isExactCacheFile(parsed) || parsed.key !== key) {
        this.removeFile(path);
        return null;
      }
      if (parsed.expiry <= now) {
        this.removeFile(path);
        return null;
      }
      const accessed = new Date(now);
      utimesSync(path, accessed, accessed);
      return { data: parsed.data, expiry: parsed.expiry };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(
          { path, error: error instanceof Error ? error.message : String(error) },
          'Ignoring unreadable exact-cache entry',
        );
        this.removeFile(path);
      }
      return null;
    }
  }

  set(key: string, entry: ExactCacheEntry): void {
    const path = this.pathForKey(key);
    const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const payload: ExactCacheFile = {
      schema_version: 'exact-search-cache-v1',
      key,
      expiry: entry.expiry,
      data: entry.data,
    };
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(tempPath, `${JSON.stringify(payload)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      if (statSync(tempPath).size > this.maxFileBytes) {
        this.removeFile(tempPath);
        logger.warn({ key }, 'Exact-cache entry exceeds the file-size limit');
        return;
      }
      renameSync(tempPath, path);
      this.evict(Date.now());
    } catch (error) {
      this.removeFile(tempPath);
      logger.warn(
        { path, error: error instanceof Error ? error.message : String(error) },
        'Exact-cache persistence failed; continuing without the durable write',
      );
    }
  }

  delete(key: string): void {
    this.removeFile(this.pathForKey(key));
  }

  clear(): void {
    for (const path of this.cacheFiles()) this.removeFile(path);
  }

  size(): number {
    return this.cacheFiles().length;
  }

  private pathForKey(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex');
    return join(this.directory, `${digest}${CACHE_FILE_SUFFIX}`);
  }

  private cacheFiles(): string[] {
    try {
      return readdirSync(this.directory)
        .filter(name => name.endsWith(CACHE_FILE_SUFFIX))
        .map(name => join(this.directory, name));
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? [] : [];
    }
  }

  private evict(now: number): void {
    const candidates = this.cacheFiles()
      .map(path => {
        try {
          return { path, mtimeMs: statSync(path).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { path: string; mtimeMs: number } => entry !== null)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const candidate of [...candidates]) {
      try {
        const parsed = JSON.parse(readFileSync(candidate.path, 'utf8')) as unknown;
        if (!isExactCacheFile(parsed) || parsed.expiry <= now) {
          this.removeFile(candidate.path);
          const index = candidates.indexOf(candidate);
          if (index >= 0) candidates.splice(index, 1);
        }
      } catch {
        this.removeFile(candidate.path);
        const index = candidates.indexOf(candidate);
        if (index >= 0) candidates.splice(index, 1);
      }
    }
    while (candidates.length > this.options.maxSize) {
      const oldest = candidates.shift();
      if (oldest) this.removeFile(oldest.path);
    }
  }

  private removeFile(path: string): void {
    try {
      rmSync(path, { force: true });
    } catch {
      // Cache cleanup is best effort and never blocks search.
    }
  }
}

export function createExactCacheStore(
  directory: string | undefined,
  maxSize: number,
): ExactCacheStore {
  return directory?.trim()
    ? new FileExactCacheStore(directory, { maxSize })
    : new MemoryExactCacheStore(maxSize);
}

function isExactCacheFile(value: unknown): value is ExactCacheFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExactCacheFile>;
  return candidate.schema_version === 'exact-search-cache-v1'
    && typeof candidate.key === 'string'
    && candidate.key.length > 0
    && typeof candidate.expiry === 'number'
    && Number.isSafeInteger(candidate.expiry)
    && candidate.expiry > 0
    && Object.prototype.hasOwnProperty.call(candidate, 'data');
}
