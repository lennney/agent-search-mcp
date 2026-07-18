export interface RateLimitInfo {
  remaining: number;
  resetInMs: number;
  limit: number;
}

export interface RateLimiterOptions {
  /** Per-engine min interval in ms. Engine not in map → defaultIntervalMs. */
  engineRates?: Record<string, number>;
  /** Default min interval in ms (used when engine not in engineRates). */
  defaultIntervalMs?: number;
}

/**
 * Per-engine rate limiter for lightweight VPS.
 *
 * Free engines (DDG, Sogou, Baidu) need longer intervals to avoid anti-bot;
 * paid engines (Brave, Tavily, Exa) can be called more aggressively.
 *
 * All state is in-memory — no persistence, no background sweeps.
 */
export class RateLimiter {
  private lastRequest = new Map<string, number>();
  private engineRates: Record<string, number>;
  private defaultIntervalMs: number;

  // Sensible defaults for 11 engines on a lightweight VPS
  static readonly DEFAULT_ENGINE_RATES: Record<string, number> = {
    // Free engines — respectful intervals to avoid rate-limiting
    ddg: 1_200,
    sogou: 1_200,
    bing: 1_200,
    baidu: 1_500,
    wikipedia: 1_000,
    startpage: 1_000,
    // Paid / API-based engines — fast calls
    brave: 400,
    tavily: 300,
    exa: 300,
    yandex: 600,
    mojeek: 600,
  };

  constructor(options: RateLimiterOptions = {}) {
    this.engineRates = options.engineRates ?? RateLimiter.DEFAULT_ENGINE_RATES;
    this.defaultIntervalMs = options.defaultIntervalMs ?? 1_000;
  }

  /** Return the effective interval (ms) for a given engine. */
  private intervalFor(engine: string): number {
    return this.engineRates[engine] ?? this.defaultIntervalMs;
  }

  async waitForSlot(provider: string): Promise<void> {
    const interval = this.intervalFor(provider);
    const last = this.lastRequest.get(provider) || 0;
    const wait = interval - (Date.now() - last);
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }
    this.lastRequest.set(provider, Date.now());
  }

  getRateLimitInfo(provider: string): RateLimitInfo {
    const interval = this.intervalFor(provider);
    const last = this.lastRequest.get(provider) || 0;
    const elapsed = Date.now() - last;
    const resetInMs = Math.max(0, interval - elapsed);

    return {
      remaining: resetInMs === 0 ? 1 : 0,
      resetInMs,
      limit: Math.max(1, Math.round(60_000 / interval)),
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
