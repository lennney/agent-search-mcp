export interface ProviderHealth {
  provider: string;
  lastSuccess: number | null;
  lastError: number | null;
  errorCount: number;
  avgLatency: number;
  isHealthy: boolean;
}

export class HealthTracker {
  private health = new Map<string, ProviderHealth>();

  recordSuccess(provider: string, latency: number): void {
    const h = this.getOrCreate(provider);
    h.lastSuccess = Date.now();
    h.errorCount = Math.max(0, h.errorCount - 1);
    h.avgLatency = (h.avgLatency + latency) / 2;
    h.isHealthy = h.errorCount < 5;
  }

  recordFailure(provider: string): void {
    const h = this.getOrCreate(provider);
    h.lastError = Date.now();
    h.errorCount++;
    h.isHealthy = h.errorCount < 5;
  }

  getHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  isHealthy(provider: string): boolean {
    return this.health.get(provider)?.isHealthy !== false;
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
      });
    }
    return this.health.get(provider)!;
  }
}
