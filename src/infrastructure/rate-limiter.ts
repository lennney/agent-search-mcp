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
}
