import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { EngineError } from '../types.js';
import { logger } from './logger.js';

export type ProviderCooldownFailureType = Exclude<
  EngineError['type'],
  'budget_exhausted'
>;

export interface ProviderCooldownRecord {
  provider: string;
  failure_type: ProviderCooldownFailureType;
  expires_at: number;
}

export interface ProviderCooldownStore {
  loadActive(now: number): ProviderCooldownRecord[];
  put(record: ProviderCooldownRecord): void;
  remove(provider: string): void;
}

interface CooldownFile {
  schema_version: 'provider-cooldown-v1';
  records: ProviderCooldownRecord[];
}

const FAILURE_TYPES = new Set<ProviderCooldownFailureType>([
  'validation_error',
  'parse_error',
  'timeout',
  'upstream_4xx',
  'upstream_5xx',
  'rate_limited',
  'bot_challenge',
  'permission_denied',
  'unknown',
]);

export class MemoryProviderCooldownStore implements ProviderCooldownStore {
  private readonly records = new Map<string, ProviderCooldownRecord>();

  loadActive(now: number): ProviderCooldownRecord[] {
    this.prune(now);
    return [...this.records.values()].map(record => ({ ...record }));
  }

  put(record: ProviderCooldownRecord): void {
    const current = this.records.get(record.provider);
    if (!current || record.expires_at >= current.expires_at) {
      this.records.set(record.provider, { ...record });
    }
  }

  remove(provider: string): void {
    this.records.delete(provider);
  }

  private prune(now: number): void {
    for (const [provider, record] of this.records) {
      if (record.expires_at <= now) this.records.delete(provider);
    }
  }
}

export class FileProviderCooldownStore implements ProviderCooldownStore {
  readonly path: string;

  constructor(path: string) {
    if (!path.trim()) throw new Error('Provider cooldown store path must not be empty');
    this.path = resolve(path);
  }

  loadActive(now: number): ProviderCooldownRecord[] {
    const records = this.readRecords().filter(record => record.expires_at > now);
    return records.map(record => ({ ...record }));
  }

  put(record: ProviderCooldownRecord): void {
    const records = this.readRecords();
    const current = records.find(candidate => candidate.provider === record.provider);
    const next = current && current.expires_at > record.expires_at
      ? records
      : [
          ...records.filter(candidate => candidate.provider !== record.provider),
          { ...record },
        ];
    this.writeRecords(next);
  }

  remove(provider: string): void {
    const records = this.readRecords();
    const next = records.filter(record => record.provider !== provider);
    if (next.length !== records.length) this.writeRecords(next);
  }

  private readRecords(): ProviderCooldownRecord[] {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as unknown;
      if (!isCooldownFile(parsed)) {
        logger.warn(
          { path: this.path },
          'Ignoring invalid provider cooldown store',
        );
        return [];
      }
      return parsed.records;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(
          { path: this.path, error: error instanceof Error ? error.message : String(error) },
          'Ignoring unreadable provider cooldown store',
        );
      }
      return [];
    }
  }

  private writeRecords(records: ProviderCooldownRecord[]): void {
    const payload: CooldownFile = {
      schema_version: 'provider-cooldown-v1',
      records,
    };
    const tempPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(tempPath, `${JSON.stringify(payload)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      renameSync(tempPath, this.path);
    } catch (error) {
      rmSync(tempPath, { force: true });
      logger.warn(
        { path: this.path, error: error instanceof Error ? error.message : String(error) },
        'Provider cooldown persistence failed; continuing in memory',
      );
    }
  }
}

export function createProviderCooldownStore(
  path: string | undefined,
): ProviderCooldownStore {
  return path?.trim()
    ? new FileProviderCooldownStore(path)
    : new MemoryProviderCooldownStore();
}

function isCooldownFile(value: unknown): value is CooldownFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CooldownFile>;
  return candidate.schema_version === 'provider-cooldown-v1'
    && Array.isArray(candidate.records)
    && candidate.records.every(isCooldownRecord);
}

function isCooldownRecord(value: unknown): value is ProviderCooldownRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProviderCooldownRecord>;
  return typeof candidate.provider === 'string'
    && candidate.provider.length > 0
    && candidate.provider.length <= 100
    && typeof candidate.failure_type === 'string'
    && FAILURE_TYPES.has(candidate.failure_type as ProviderCooldownFailureType)
    && typeof candidate.expires_at === 'number'
    && Number.isSafeInteger(candidate.expires_at)
    && candidate.expires_at > 0;
}
