/**
 * Sliding-window in-memory rate limiter keyed by an arbitrary string.
 *
 * Process-local — fine for a single api-server instance, deliberately
 * documented as a remaining risk for multi-instance deployments where you'd
 * want a Redis-backed store. Multiple consumers (share-link consumption,
 * signature-request consumption, demo-request submission) instantiate their
 * own limiters with their own window/max so the limits stay independent.
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  constructor(private readonly windowMs: number, private readonly max: number) {}

  /** Returns true when the request is allowed; false if it should be rejected. */
  allow(key: string): boolean {
    const now = Date.now();
    if (now - this.lastSweep > this.windowMs) {
      this.sweep(now);
      this.lastSweep = now;
    }
    const arr = this.hits.get(key) ?? [];
    const cutoff = now - this.windowMs;
    const fresh = arr.filter((t) => t > cutoff);
    if (fresh.length >= this.max) {
      this.hits.set(key, fresh);
      return false;
    }
    fresh.push(now);
    this.hits.set(key, fresh);
    return true;
  }

  private sweep(now: number) {
    const cutoff = now - this.windowMs;
    for (const [k, arr] of this.hits) {
      const fresh = arr.filter((t) => t > cutoff);
      if (fresh.length === 0) this.hits.delete(k);
      else this.hits.set(k, fresh);
    }
  }

  /** Test-only: reset all counters. */
  reset(): void {
    this.hits.clear();
    this.lastSweep = Date.now();
  }
}
