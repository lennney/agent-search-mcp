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
}

export class HealthTracker {
  private health = new Map<string, ProviderHealth>();
  
  // Circuit breaker configuration
  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly INITIAL_COOLDOWN_MS = 30_000; // 30 seconds
  private static readonly MAX_COOLDOWN_MS = 300_000; // 5 minutes
  private static readonly HALF_OPEN_MAX_ATTEMPTS = 1;

  recordSuccess(provider: string, latency: number): void {
    const h = this.getOrCreate(provider);
    h.lastSuccess = Date.now();
    h.errorCount = Math.max(0, h.errorCount - 1);
    h.avgLatency = (h.avgLatency + latency) / 2;
    
    // Close circuit on success (recovery)
    // Allow immediate recovery when error count drops below threshold
    if (h.circuitState !== 'closed' && h.errorCount < HealthTracker.FAILURE_THRESHOLD) {
      h.circuitState = 'closed';
      h.circuitOpenedAt = null;
      h.circuitCooldownMs = HealthTracker.INITIAL_COOLDOWN_MS;
      console.log(`[Health] Circuit CLOSED for ${provider} (recovered, errors: ${h.errorCount})`);
    }
    
    h.isHealthy = this.calculateHealth(h);
  }

  recordFailure(provider: string): void {
    const h = this.getOrCreate(provider);
    h.lastError = Date.now();
    h.errorCount++;
    
    // Open circuit if threshold exceeded
    if (h.errorCount >= HealthTracker.FAILURE_THRESHOLD && h.circuitState === 'closed') {
      h.circuitState = 'open';
      h.circuitOpenedAt = Date.now();
      console.log(`[Health] Circuit OPENED for ${provider} (errors: ${h.errorCount})`);
    }
    
    // If half-open and failed again, re-open with longer cooldown
    if (h.circuitState === 'half-open') {
      h.circuitState = 'open';
      h.circuitOpenedAt = Date.now();
      h.circuitCooldownMs = Math.min(h.circuitCooldownMs * 2, HealthTracker.MAX_COOLDOWN_MS);
      console.log(`[Health] Circuit RE-OPENED for ${provider} (cooldown: ${h.circuitCooldownMs}ms)`);
    }
    
    h.isHealthy = this.calculateHealth(h);
  }

  getHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  isHealthy(provider: string): boolean {
    const h = this.health.get(provider);
    if (!h) return true; // Unknown providers are assumed healthy
    
    // Check if circuit should transition to half-open
    if (h.circuitState === 'open' && h.circuitOpenedAt) {
      const elapsed = Date.now() - h.circuitOpenedAt;
      if (elapsed >= h.circuitCooldownMs) {
        h.circuitState = 'half-open';
        console.log(`[Health] Circuit HALF-OPEN for ${provider} (testing recovery)`);
        return true; // Allow one test request
      }
      return false; // Still in cooldown
    }
    
    return h.isHealthy;
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
      });
    }
    return this.health.get(provider)!;
  }
}
