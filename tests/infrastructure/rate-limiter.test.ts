import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/infrastructure/rate-limiter.js';

describe('RateLimiter', () => {
  it('returns remaining=1 for unused provider', () => {
    const rl = new RateLimiter();
    const info = rl.getRateLimitInfo('brave');
    expect(info.remaining).toBe(1);
    expect(info.resetInMs).toBe(0);
  });

  it('returns remaining=0 immediately after waitForSlot', async () => {
    const rl = new RateLimiter();
    await rl.waitForSlot('tavily');
    const info = rl.getRateLimitInfo('tavily');
    expect(info.remaining).toBe(0);
    expect(info.resetInMs).toBeGreaterThan(0);
  });

  it('tracks separate slots per provider', async () => {
    const rl = new RateLimiter();
    await rl.waitForSlot('ddg');
    await rl.waitForSlot('sogou'); // should not block if different provider

    const ddg = rl.getRateLimitInfo('ddg');
    const sogou = rl.getRateLimitInfo('sogou');
    expect(ddg.remaining).toBe(0);
    expect(sogou.remaining).toBe(0);
  });

  it('getAllRateLimits returns entries for all providers', () => {
    const rl = new RateLimiter();
    const limits = rl.getAllRateLimits(['ddg', 'brave', 'tavily']);
    expect(Object.keys(limits)).toEqual(['ddg', 'brave', 'tavily']);
    for (const key of ['ddg', 'brave', 'tavily']) {
      expect(limits[key].remaining).toBe(1);
      expect(limits[key].resetInMs).toBe(0);
    }
  });

  it('waitForSlot blocks for approximately minInterval', async () => {
    const rl = new RateLimiter();
    const start = Date.now();
    await rl.waitForSlot('test');
    await rl.waitForSlot('test');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900); // 1s - margin
  });

  // ---- Per-engine rate tests ----
  it('uses shorter interval for paid (fast) engines', async () => {
    const rl = new RateLimiter({
      engineRates: { brave: 100, tavily: 100, ddg: 2000 },
    });
    const start = Date.now();
    await rl.waitForSlot('brave');
    await rl.waitForSlot('brave');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500); // 100ms * 2 is fast
  });

  it('uses default interval for unknown engines', async () => {
    const rl = new RateLimiter({
      engineRates: { brave: 100 },
      defaultIntervalMs: 500,
    });
    const start = Date.now();
    await rl.waitForSlot('unknown-engine');
    await rl.waitForSlot('unknown-engine');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(400);
  });

  it('empty engineRates falls back to defaultIntervalMs', async () => {
    // This tests backward-compat: no engineRates config = old behavior
    const rl = new RateLimiter({ defaultIntervalMs: 200 });
    const start = Date.now();
    await rl.waitForSlot('any');
    await rl.waitForSlot('any');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });
});
