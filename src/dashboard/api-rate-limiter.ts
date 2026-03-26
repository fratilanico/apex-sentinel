// FR-W14-07: ApiRateLimiter — per-IP token bucket, 60 req/min

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class ApiRateLimiter {
  private readonly maxTokens: number;
  private readonly refillRatePerSec: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(maxTokens = 60, refillRatePerSec = 1) {
    this.maxTokens = maxTokens;
    this.refillRatePerSec = refillRatePerSec;
  }

  checkRequest(ip: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(ip, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    const refill = elapsedSec * this.refillRatePerSec;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }

    // Calculate retry after
    const tokensNeeded = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.refillRatePerSec) * 1000);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  reset(ip: string): void {
    this.buckets.delete(ip);
  }

  resetAll(): void {
    this.buckets.clear();
  }

  getBucketCount(): number {
    return this.buckets.size;
  }
}
