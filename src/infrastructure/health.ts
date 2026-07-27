import { SearchCache } from './cache.js';
import { logger } from './logger.js';
import {
  MemoryProviderCooldownStore,
  type ProviderCooldownFailureType,
  type ProviderCooldownStore,
} from './provider-cooldown-store.js';

export interface ServerMetricsData {
  /** Server uptime in seconds */
  uptime: number;
  /** Process memory usage from process.memoryUsage() */
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  /** Total number of requests handled */
  requestCount: number;
  /** Average request latency in milliseconds */
  avgLatency: number;
  /** Cache hit rate as a float 0–1, or -1 if no cache requests yet */
  cacheHitRate: number;
  /** Cache statistics from SearchCache */
  cacheStats: {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
  };
}

/**
 * Tracks server-wide runtime metrics: uptime, memory, request count,
 * average latency, and cache hit rate.
 *
 * Uses only built-in Node.js modules (node:process).
 * Integrates with SearchCache for cache telemetry.
 */
export class ServerMetrics {
  private readonly startTime = Date.now();
  private requestCount = 0;
  private totalLatency = 0;
  private readonly cache?: SearchCache;

  constructor(cache?: SearchCache) {
    this.cache = cache;
  }

  /** Record a completed request with its latency in milliseconds. */
  recordRequest(latency: number): void {
    this.requestCount++;
    this.totalLatency += latency;
  }

  /** Return a snapshot of current server metrics. */
  getMetrics(): ServerMetricsData {
    const mem = process.memoryUsage();
    const avgLat = this.requestCount > 0
      ? this.totalLatency / this.requestCount
      : 0;

    let cacheHitRate = -1;
    let cacheStats = { hits: 0, misses: 0, size: 0, maxSize: 0 };

    if (this.cache) {
      const stats = this.cache.stats();
      cacheStats = stats;
      const total = stats.hits + stats.misses;
      cacheHitRate = total > 0 ? stats.hits / total : -1;
    }

    return {
      uptime: (Date.now() - this.startTime) / 1000,
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      requestCount: this.requestCount,
      avgLatency: Math.round(avgLat * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 10000) / 10000,
      cacheStats,
    };
  }
}

export interface ProviderHealth {
  provider: string;
  lastSuccess: number | null;
  lastError: number | null;
  errorCount: number;
  avgLatency: number;
  isHealthy: boolean;
  // Circuit breaker state
  circuitState: 'closed' | 'open' | 'half-open';
  circuitOpenedAt: number | null;
  circuitCooldownMs: number;
  /** Explicit upstream suspension, e.g. after a CAPTCHA challenge. */
  suspendedUntil: number | null;
  suspensionFailureType: ProviderCooldownFailureType | null;
  lastFailureType: ProviderCooldownFailureType | null;
}

export type ProviderAvailability =
  | { available: true }
  | {
      available: false;
      failureType: ProviderCooldownFailureType;
      retryAt: number | null;
    };

export class HealthTracker {
  private health = new Map<string, ProviderHealth>();
  private readonly cooldownStore: ProviderCooldownStore;
  
  // Circuit breaker configuration
  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly INITIAL_COOLDOWN_MS = 30_000; // 30 seconds
  private static readonly MAX_COOLDOWN_MS = 300_000; // 5 minutes
  private static readonly HALF_OPEN_MAX_ATTEMPTS = 1;

  constructor(
    cooldownStore: ProviderCooldownStore = new MemoryProviderCooldownStore(),
  ) {
    this.cooldownStore = cooldownStore;
    let activeCooldowns: ReturnType<ProviderCooldownStore['loadActive']> = [];
    try {
      activeCooldowns = cooldownStore.loadActive(Date.now());
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Provider cooldown store failed to load; starting with memory state',
      );
    }
    for (const record of activeCooldowns) {
      const health = this.getOrCreate(record.provider);
      health.suspendedUntil = record.expires_at;
      health.suspensionFailureType = record.failure_type;
      health.lastError = Date.now();
      health.isHealthy = false;
    }
  }

  recordSuccess(provider: string, latency: number): void {
    const h = this.getOrCreate(provider);
    const hadSuspension = h.suspendedUntil !== null;
    h.lastSuccess = Date.now();
    h.errorCount = Math.max(0, h.errorCount - 1);
    h.avgLatency = (h.avgLatency + latency) / 2;
    h.suspendedUntil = null;
    h.suspensionFailureType = null;
    h.lastFailureType = null;
    if (hadSuspension) this.removePersistedCooldown(provider);
    
    // Close circuit on success (recovery)
    // Allow immediate recovery when error count drops below threshold
    if (h.circuitState !== 'closed' && h.errorCount < HealthTracker.FAILURE_THRESHOLD) {
      h.circuitState = 'closed';
      h.circuitOpenedAt = null;
      h.circuitCooldownMs = HealthTracker.INITIAL_COOLDOWN_MS;
      logger.info({ provider, errors: h.errorCount }, 'Health circuit closed after recovery');
    }
    
    h.isHealthy = this.calculateHealth(h);
  }

  recordFailure(
    provider: string,
    failureType: ProviderCooldownFailureType = 'unknown',
  ): void {
    const h = this.getOrCreate(provider);
    h.lastError = Date.now();
    h.errorCount++;
    h.lastFailureType = failureType;
    
    // Open circuit if threshold exceeded
    if (h.errorCount >= HealthTracker.FAILURE_THRESHOLD && h.circuitState === 'closed') {
      h.circuitState = 'open';
      h.circuitOpenedAt = Date.now();
      logger.warn({ provider, errors: h.errorCount }, 'Health circuit opened');
    }
    
    // If half-open and failed again, re-open with longer cooldown
    if (h.circuitState === 'half-open') {
      h.circuitState = 'open';
      h.circuitOpenedAt = Date.now();
      h.circuitCooldownMs = Math.min(h.circuitCooldownMs * 2, HealthTracker.MAX_COOLDOWN_MS);
      logger.warn(
        { provider, cooldownMs: h.circuitCooldownMs },
        'Health circuit re-opened after failed probe'
      );
    }
    
    h.isHealthy = this.calculateHealth(h);
  }

  /**
   * Suspend a provider immediately after an upstream-declared challenge.
   * This is separate from the generic failure-count circuit breaker so a
   * single CAPTCHA does not need four more requests before traffic stops.
   */
  suspend(
    provider: string,
    cooldownMs: number,
    failureType: ProviderCooldownFailureType = 'bot_challenge',
  ): void {
    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
      throw new Error('Provider suspension cooldown must be positive');
    }
    const h = this.getOrCreate(provider);
    const now = Date.now();
    h.lastError = now;
    h.suspendedUntil = Math.max(h.suspendedUntil ?? 0, now + cooldownMs);
    h.suspensionFailureType = failureType;
    h.lastFailureType = failureType;
    h.isHealthy = false;
    this.persistCooldown({
      provider,
      failure_type: failureType,
      expires_at: h.suspendedUntil,
    });
    logger.warn(
      { provider, cooldownMs },
      'Provider suspended after upstream challenge',
    );
  }

  getHealth(): ProviderHealth[] {
    for (const h of this.health.values()) {
      this.refreshSuspension(h);
    }
    return Array.from(this.health.values());
  }

  isHealthy(provider: string): boolean {
    return this.getAvailability(provider).available;
  }

  getAvailability(provider: string): ProviderAvailability {
    const h = this.health.get(provider);
    if (!h) return { available: true }; // Unknown providers are assumed healthy

    this.refreshSuspension(h);
    if (h.suspendedUntil !== null) {
      return {
        available: false,
        failureType: h.suspensionFailureType ?? h.lastFailureType ?? 'unknown',
        retryAt: h.suspendedUntil,
      };
    }
    
    // Check if circuit should transition to half-open
    if (h.circuitState === 'open' && h.circuitOpenedAt) {
      const elapsed = Date.now() - h.circuitOpenedAt;
      if (elapsed >= h.circuitCooldownMs) {
        h.circuitState = 'half-open';
        logger.info({ provider }, 'Health circuit half-open; testing recovery');
        return { available: true }; // Allow one test request
      }
      return {
        available: false,
        failureType: h.lastFailureType ?? 'unknown',
        retryAt: h.circuitOpenedAt + h.circuitCooldownMs,
      };
    }
    
    return h.isHealthy
      ? { available: true }
      : {
          available: false,
          failureType: h.lastFailureType ?? 'unknown',
          retryAt: null,
        };
  }

  private refreshSuspension(h: ProviderHealth): void {
    if (h.suspendedUntil === null || Date.now() < h.suspendedUntil) return;
    h.suspendedUntil = null;
    h.suspensionFailureType = null;
    this.removePersistedCooldown(h.provider);
    h.isHealthy = this.calculateHealth(h);
    logger.info({ provider: h.provider }, 'Provider suspension expired');
  }

  private calculateHealth(h: ProviderHealth): boolean {
    // In half-open or open state, use circuit state
    if (h.circuitState === 'open') return false;
    if (h.circuitState === 'half-open') return true;
    
    // In closed state, use error count
    return h.errorCount < HealthTracker.FAILURE_THRESHOLD;
  }

  private getOrCreate(provider: string): ProviderHealth {
    if (!this.health.has(provider)) {
      this.health.set(provider, {
        provider,
        lastSuccess: null,
        lastError: null,
        errorCount: 0,
        avgLatency: 0,
        isHealthy: true,
        circuitState: 'closed',
        circuitOpenedAt: null,
        circuitCooldownMs: HealthTracker.INITIAL_COOLDOWN_MS,
        suspendedUntil: null,
        suspensionFailureType: null,
        lastFailureType: null,
      });
    }
    return this.health.get(provider)!;
  }

  private persistCooldown(
    record: Parameters<ProviderCooldownStore['put']>[0],
  ): void {
    try {
      this.cooldownStore.put(record);
    } catch (error) {
      logger.warn(
        { provider: record.provider, error: error instanceof Error ? error.message : String(error) },
        'Provider cooldown store rejected an update; continuing in memory',
      );
    }
  }

  private removePersistedCooldown(provider: string): void {
    try {
      this.cooldownStore.remove(provider);
    } catch (error) {
      logger.warn(
        { provider, error: error instanceof Error ? error.message : String(error) },
        'Provider cooldown store rejected a removal; continuing in memory',
      );
    }
  }
}
