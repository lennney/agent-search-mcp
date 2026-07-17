export interface RateLimitInfo {
  remaining: number;
  resetInMs: number;
  limit: number;
}

export class RateLimiter {
  private lastRequest = new Map<string, number>();
  private minInterval = 1000;

  async waitForSlot(provider: string): Promise<void> {
    const last = this.lastRequest.get(provider) || 0;
    const wait = this.minInterval - (Date.now() - last);
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }
    this.lastRequest.set(provider, Date.now());
  }

  getRateLimitInfo(provider: string): RateLimitInfo {
    const last = this.lastRequest.get(provider) || 0;
    const elapsed = Date.now() - last;
    const resetInMs = Math.max(0, this.minInterval - elapsed);

    return {
      remaining: resetInMs === 0 ? 1 : 0,
      resetInMs,
      limit: 1,
    };
  }

  getAllRateLimits(providers: string[]): Record<string, { remaining: number; resetInMs: number }> {
    const result: Record<string, { remaining: number; resetInMs: number }> = {};
    for (const provider of providers) {
      const info = this.getRateLimitInfo(provider);
      result[provider] = { remaining: info.remaining, resetInMs: info.resetInMs };
    }
    return result;
  }
}