import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execFileSync so we don't actually call Python
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

import { execFileSync } from 'child_process';
import { isDdgsAvailable, duckduckgoProvider } from '../../src/engines/duckduckgo.js';

describe('DuckDuckGo engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('has correct provider metadata', () => {
    expect(duckduckgoProvider.id).toBe('duckduckgo');
    expect(duckduckgoProvider.name).toBe('DuckDuckGo');
    expect(duckduckgoProvider.isFree).toBe(true);
  });

  it('isDdgsAvailable returns true when ddgs is installed', async () => {
    vi.mocked(execFileSync).mockReturnValue('5.0.0\n');
    // Re-import to reset lazy cache
    const mod = await import('../../src/engines/duckduckgo.js');
    expect(mod.isDdgsAvailable()).toBe(true);
  });

  it('isDdgsAvailable returns false when ddgs is not installed', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });
    const mod = await import('../../src/engines/duckduckgo.js');
    expect(mod.isDdgsAvailable()).toBe(false);
  });

  it('caches the ddgs availability check (only calls execFileSync once per import)', async () => {
    vi.mocked(execFileSync).mockReturnValue('5.0.0\n');
    const mod = await import('../../src/engines/duckduckgo.js');
    mod.isDdgsAvailable();
    mod.isDdgsAvailable();
    mod.isDdgsAvailable();
    // Should only call execFileSync once per candidate at most
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});
