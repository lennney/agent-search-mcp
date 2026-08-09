import { describe, it, expect, vi } from 'vitest';
import { ServerMetrics, HealthTracker } from '../../src/infrastructure/health.js';
import { SearchCache } from '../../src/infrastructure/cache.js';

describe('ServerMetrics', () => {
  it('returns initial metrics with zero counts', () => {
    const metrics = new ServerMetrics();
    const m = metrics.getMetrics();
    expect(m.uptime).toBeGreaterThanOrEqual(0);
    expect(m.requestCount).toBe(0);
    expect(m.avgLatency).toBe(0);
    expect(m.cacheHitRate).toBe(-1);
    expect(m.memory).toBeDefined();
    expect(typeof m.memory.rss).toBe('number');
    expect(typeof m.memory.heapUsed).toBe('number');
    expect(typeof m.memory.heapTotal).toBe('number');
    expect(typeof m.memory.external).toBe('number');
  });

  it('records requests and computes avg latency', () => {
    const metrics = new ServerMetrics();
    metrics.recordRequest(100);
    metrics.recordRequest(200);
    metrics.recordRequest(300);

    const m = metrics.getMetrics();
    expect(m.requestCount).toBe(3);
    expect(m.avgLatency).toBe(200); // (100 + 200 + 300) / 3
  });

  it('records a single request correctly', () => {
    const metrics = new ServerMetrics();
    metrics.recordRequest(42);

    const m = metrics.getMetrics();
    expect(m.requestCount).toBe(1);
    expect(m.avgLatency).toBe(42);
  });

  it('uptime increases over time', async () => {
    const metrics = new ServerMetrics();
    const m1 = metrics.getMetrics();
    await new Promise(r => setTimeout(r, 10));
    const m2 = metrics.getMetrics();
    expect(m2.uptime).toBeGreaterThan(m1.uptime);
  });

  it('returns cache hit rate when cache is provided', () => {
    const cache = new SearchCache({ maxSize: 10, defaultTtlMs: 60_000 });
    const metrics = new ServerMetrics(cache);

    // Initial state — no cache requests yet
    const m1 = metrics.getMetrics();
    expect(m1.cacheHitRate).toBe(-1);
    expect(m1.cacheStats.hits).toBe(0);
    expect(m1.cacheStats.misses).toBe(0);

    // Make some cache requests
    cache.set('key1', 'val1');
    cache.get('key1'); // hit
    cache.get('key1'); // hit
    cache.get('missing'); // miss

    const m2 = metrics.getMetrics();
    expect(m2.cacheStats.hits).toBe(2);
    expect(m2.cacheStats.misses).toBe(1);
    expect(m2.cacheHitRate).toBeCloseTo(2 / 3, 4);
  });

  it('returns -1 cache hit rate when cache is not provided', () => {
    const metrics = new ServerMetrics();
    const m = metrics.getMetrics();
    expect(m.cacheHitRate).toBe(-1);
    expect(m.cacheStats.hits).toBe(0);
  });

  it('returns memory from process.memoryUsage()', () => {
    const metrics = new ServerMetrics();
    const m = metrics.getMetrics();
    expect(m.memory.rss).toBeGreaterThan(0);
    expect(m.memory.heapUsed).toBeGreaterThan(0);
    expect(m.memory.heapTotal).toBeGreaterThan(0);
    expect(m.memory.external).toBeGreaterThanOrEqual(0);
  });

  it('cache stats reflect cache size and maxSize', () => {
    const cache = new SearchCache({ maxSize: 5, defaultTtlMs: 60_000 });
    const metrics = new ServerMetrics(cache);

    cache.set('a', 1);
    cache.set('b', 2);

    const m = metrics.getMetrics();
    expect(m.cacheStats.size).toBe(2);
    expect(m.cacheStats.maxSize).toBe(5);
  });
});

describe('ServerMetrics edge cases', () => {
  it('handles rapid sequential requests', () => {
    const metrics = new ServerMetrics();
    for (let i = 0; i < 1000; i++) {
      metrics.recordRequest(i);
    }
    const m = metrics.getMetrics();
    expect(m.requestCount).toBe(1000);
    // Sum 0..999 = 499500, avg = 499.5
    expect(m.avgLatency).toBe(499.5);
  });

  it('produces valid JSON serializable output', () => {
    const cache = new SearchCache({ maxSize: 10 });
    const metrics = new ServerMetrics(cache);
    metrics.recordRequest(50);
    cache.set('k', 'v');
    cache.get('k');

    const m = metrics.getMetrics();
    const json = JSON.stringify(m);
    const parsed = JSON.parse(json);
    expect(parsed.uptime).toBeGreaterThanOrEqual(0);
    expect(parsed.requestCount).toBe(1);
    expect(parsed.avgLatency).toBe(50);
    expect(parsed.cacheHitRate).toBe(1);
    expect(parsed.cacheStats.hits).toBe(1);
  });
});

describe('HealthTracker', () => {
  it('admits only one half-open probe after the circuit cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'));
    try {
      const health = new HealthTracker();
      for (let attempt = 0; attempt < 5; attempt++) {
        health.recordFailure('test-provider');
      }

      vi.advanceTimersByTime(30_000);

      const first = health.acquireAttempt('test-provider');
      const second = health.acquireAttempt('test-provider');

      expect(first.acquired).toBe(true);
      expect(second).toEqual({
        acquired: false,
        failureType: 'unknown',
        retryAt: null,
      });
      if (!first.acquired) throw new Error('expected the first probe lease');
      first.lease.finish({ status: 'released' });
      expect(health.acquireAttempt('test-provider').acquired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the circuit when the half-open probe succeeds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'));
    try {
      const health = new HealthTracker();
      for (let attempt = 0; attempt < 5; attempt++) {
        health.recordFailure('test-provider');
      }
      vi.advanceTimersByTime(30_000);

      const admission = health.acquireAttempt('test-provider');
      if (!admission.acquired) throw new Error('expected a probe lease');
      admission.lease.finish({ status: 'success', latency: 125 });

      expect(health.getHealth()[0]).toMatchObject({
        circuitState: 'closed',
        errorCount: 4,
        avgLatency: 125,
        isHealthy: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reopens the circuit with backoff when the half-open probe fails', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'));
    try {
      const health = new HealthTracker();
      for (let attempt = 0; attempt < 5; attempt++) {
        health.recordFailure('test-provider');
      }
      vi.advanceTimersByTime(30_000);

      const admission = health.acquireAttempt('test-provider');
      if (!admission.acquired) throw new Error('expected a probe lease');
      admission.lease.finish({ status: 'failure', failureType: 'timeout' });

      expect(health.getHealth()[0]).toMatchObject({
        circuitState: 'open',
        circuitCooldownMs: 60_000,
        errorCount: 6,
        lastFailureType: 'timeout',
        isHealthy: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps provider suspension separate from the half-open probe lease', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'));
    try {
      const health = new HealthTracker();
      for (let attempt = 0; attempt < 5; attempt++) {
        health.recordFailure('test-provider');
      }
      vi.advanceTimersByTime(30_000);

      const admission = health.acquireAttempt('test-provider');
      if (!admission.acquired) throw new Error('expected a probe lease');
      admission.lease.finish({
        status: 'suspended',
        cooldownMs: 3_600_000,
        failureType: 'bot_challenge',
      });

      expect(health.acquireAttempt('test-provider')).toEqual({
        acquired: false,
        failureType: 'bot_challenge',
        retryAt: Date.parse('2026-08-07T01:00:30Z'),
      });
      vi.advanceTimersByTime(3_600_000);
      expect(health.acquireAttempt('test-provider').acquired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('finishes an attempt lease only once', () => {
    const health = new HealthTracker();
    const admission = health.acquireAttempt('test-provider');
    if (!admission.acquired) throw new Error('expected an attempt lease');

    admission.lease.finish({ status: 'failure', failureType: 'timeout' });
    admission.lease.finish({ status: 'success', latency: 100 });

    expect(health.getHealth()[0]).toMatchObject({
      errorCount: 1,
      avgLatency: 0,
      lastFailureType: 'timeout',
    });
  });

  it('does not create a health sample for an attempt released before dispatch', () => {
    const health = new HealthTracker();
    const admission = health.acquireAttempt('never-dispatched');
    if (!admission.acquired) throw new Error('expected an attempt lease');

    admission.lease.finish({ status: 'released' });

    expect(health.getHealth()).toEqual([]);
  });

  it('reports the first observed provider latency without halving it', () => {
    const health = new HealthTracker();

    health.recordSuccess('test-provider', 240);

    expect(health.getHealth()[0]?.avgLatency).toBe(240);

    health.recordSuccess('test-provider', 160);
    expect(health.getHealth()[0]?.avgLatency).toBe(200);
  });

  it('tracks provider health with circuit breaker', () => {
    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const health = new HealthTracker();
    expect(health.isHealthy('test-provider')).toBe(true);

    health.recordFailure('test-provider');
    health.recordFailure('test-provider');
    health.recordFailure('test-provider');
    health.recordFailure('test-provider');
    health.recordFailure('test-provider');

    expect(health.isHealthy('test-provider')).toBe(false);

    const report = health.getHealth();
    const tp = report.find(h => h.provider === 'test-provider');
    expect(tp).toBeDefined();
    expect(tp!.circuitState).toBe('open');
    expect(tp!.errorCount).toBe(5);
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});
