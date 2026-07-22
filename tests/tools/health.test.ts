import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/engines/duckduckgo.js', () => ({
  isDdgsAvailable: vi.fn(() => true),
  duckduckgoProvider: { id: 'duckduckgo', name: 'DuckDuckGo', isFree: true, languages: ['en'] },
  searchDuckDuckGo: vi.fn(),
  searchDuckduckgoNews: vi.fn(),
}));

import { registerHealth } from '../../src/tools/health.js';
import { HealthTracker } from '../../src/infrastructure/health.js';
import { isDdgsAvailable } from '../../src/engines/duckduckgo.js';

describe('Health tool with ddgs availability', () => {
  it('includes ddgs_available in DDG provider health', async () => {
    const ht = new HealthTracker();
    ht.recordSuccess('duckduckgo', 100);

    const mockServer: any = {
      resource: vi.fn(),
    };

    registerHealth(mockServer, ht);

    const handler = mockServer.resource.mock.calls[0][2];
    const result = await handler();

    const text = result.contents[0].text;
    const parsed = JSON.parse(text);
    const ddgHealth = parsed.find((h: any) => h.provider === 'duckduckgo');

    expect(ddgHealth).toBeDefined();
    expect(ddgHealth.ddgs_available).toBe(true);
  });

  it('shows ddgs_available=false when ddgs is not installed', async () => {
    vi.mocked(isDdgsAvailable).mockReturnValue(false);

    const ht = new HealthTracker();
    ht.recordSuccess('duckduckgo', 100);

    const mockServer: any = {
      resource: vi.fn(),
    };

    registerHealth(mockServer, ht);

    const handler = mockServer.resource.mock.calls[0][2];
    const result = await handler();

    const parsed = JSON.parse(result.contents[0].text);
    const ddgHealth = parsed.find((h: any) => h.provider === 'duckduckgo');

    expect(ddgHealth).toBeDefined();
    expect(ddgHealth.ddgs_available).toBe(false);
  });

  it('does not add ddgs fields to non-DDG providers', async () => {
    const ht = new HealthTracker();
    ht.recordSuccess('sogou', 100);

    const mockServer: any = {
      resource: vi.fn(),
    };

    registerHealth(mockServer, ht);

    const handler = mockServer.resource.mock.calls[0][2];
    const result = await handler();

    const parsed = JSON.parse(result.contents[0].text);
    const sogouHealth = parsed.find((h: any) => h.provider === 'sogou');

    expect(sogouHealth).toBeDefined();
    expect(sogouHealth.ddgs_available).toBeUndefined();
  });
});
