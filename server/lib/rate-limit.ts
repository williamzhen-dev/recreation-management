/**
 * In-memory fixed-window rate limiter. Correct for a single server instance;
 * move counters to Postgres/Redis before running several instances (see BACKLOG.md).
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

interface Bucket { count: number, resetAt: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): RateLimitResult {
    const now = this.now()
    let bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count++
    if (this.buckets.size > 10_000)
      this.sweep(now)
    return {
      allowed: bucket.count <= this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now)
        this.buckets.delete(key)
    }
  }
}
