import { describe, expect, it, vi } from 'vitest';

import { HealthTracker } from '../../src/infrastructure/health.js';
import { registerHealth } from '../../src/tools/health.js';

describe('health resource', () => {
  it('serializes provider runtime health without backend-specific probes', async () => {
    const health = new HealthTracker();
    health.recordSuccess('duckduckgo', 100);
    const server = { resource: vi.fn() };

    registerHealth(server as never, health);
    const handler = server.resource.mock.calls[0][2] as () => Promise<{
      contents: Array<{ text: string }>;
    }>;
    const result = await handler();
    const providers = JSON.parse(result.contents[0].text);

    expect(providers).toEqual([
      expect.objectContaining({
        provider: 'duckduckgo',
        isHealthy: true,
      }),
    ]);
    expect(providers[0]).not.toHaveProperty('ddgs_available');
  });
});
