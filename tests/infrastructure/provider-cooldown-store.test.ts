import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthTracker } from '../../src/infrastructure/health.js';
import {
  FileProviderCooldownStore,
  MemoryProviderCooldownStore,
} from '../../src/infrastructure/provider-cooldown-store.js';

const temporaryDirectories: string[] = [];

function temporaryStorePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agent-search-cooldown-'));
  temporaryDirectories.push(directory);
  return join(directory, 'provider-cooldowns.json');
}

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ProviderCooldownStore', () => {
  it('persists active cooldowns across tracker instances', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T00:00:00Z'));
    const path = temporaryStorePath();

    const first = new HealthTracker(new FileProviderCooldownStore(path));
    first.suspend('sogou', 3_600_000, 'bot_challenge');

    const second = new HealthTracker(new FileProviderCooldownStore(path));
    expect(second.isHealthy('sogou')).toBe(false);
    expect(second.getHealth()[0]).toMatchObject({
      provider: 'sogou',
      suspensionFailureType: 'bot_challenge',
      suspendedUntil: Date.parse('2026-07-26T01:00:00Z'),
    });
  });

  it('removes expired records from the observable store state', () => {
    const store = new MemoryProviderCooldownStore();
    store.put({
      provider: 'duckduckgo',
      failure_type: 'rate_limited',
      expires_at: 100,
    });

    expect(store.loadActive(99)).toHaveLength(1);
    expect(store.loadActive(100)).toEqual([]);
  });

  it('does not let another store instance shorten a cooldown', () => {
    const path = temporaryStorePath();
    const first = new FileProviderCooldownStore(path);
    first.put({
      provider: 'sogou',
      failure_type: 'bot_challenge',
      expires_at: 200,
    });
    new FileProviderCooldownStore(path).put({
      provider: 'sogou',
      failure_type: 'rate_limited',
      expires_at: 150,
    });

    expect(new FileProviderCooldownStore(path).loadActive(100)).toEqual([{
      provider: 'sogou',
      failure_type: 'bot_challenge',
      expires_at: 200,
    }]);
  });

  it('recovers from malformed files without failing startup', () => {
    const path = temporaryStorePath();
    writeFileSync(path, '{not-json', 'utf8');
    const store = new FileProviderCooldownStore(path);

    expect(store.loadActive(Date.now())).toEqual([]);
    store.put({
      provider: 'sogou',
      failure_type: 'bot_challenge',
      expires_at: Date.now() + 60_000,
    });
    expect(store.loadActive(Date.now())).toHaveLength(1);
  });

  it('stores only bounded provider cooldown fields', () => {
    const path = temporaryStorePath();
    const store = new FileProviderCooldownStore(path);
    store.put({
      provider: 'sogou',
      failure_type: 'bot_challenge',
      expires_at: Date.now() + 60_000,
    });

    const persisted = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(persisted.records[0]).sort()).toEqual([
      'expires_at',
      'failure_type',
      'provider',
    ]);
    expect(JSON.stringify(persisted)).not.toContain('query');
    expect(JSON.stringify(persisted)).not.toContain('token');
  });

  it('clears durable suspension after a successful probe', () => {
    const path = temporaryStorePath();
    const store = new FileProviderCooldownStore(path);
    const tracker = new HealthTracker(store);
    tracker.suspend('sogou', 60_000, 'bot_challenge');
    tracker.recordSuccess('sogou', 100);

    expect(new FileProviderCooldownStore(path).loadActive(Date.now())).toEqual([]);
    expect(tracker.isHealthy('sogou')).toBe(true);
  });

  it('keeps search startup and healthy success independent of store failures', () => {
    const remove = vi.fn(() => {
      throw new Error('store unavailable');
    });
    const store = {
      loadActive: vi.fn(() => {
        throw new Error('store unavailable');
      }),
      put: vi.fn(),
      remove,
    };

    expect(() => new HealthTracker(store)).not.toThrow();
    const tracker = new HealthTracker({
      ...store,
      loadActive: vi.fn(() => []),
    });
    tracker.recordSuccess('duckduckgo', 100);
    expect(remove).not.toHaveBeenCalled();
  });
});
