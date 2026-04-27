import type { MiddlewareHandler } from 'hono';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiterOptions {
  capacity: number;
  refillIntervalMs: number;
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string;
  /** Used in tests to inject a deterministic clock. */
  clock?: () => number;
}

export interface RateLimiter {
  middleware: MiddlewareHandler;
  reset: () => void;
}

type KeyFn = NonNullable<RateLimiterOptions['keyFn']>;

const DEFAULT_KEY: KeyFn = (c) => {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = c.req.header('x-real-ip');
  if (real) return real;
  return 'unknown';
};

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const clock = options.clock ?? Date.now;
  const keyFn = options.keyFn ?? DEFAULT_KEY;
  const refillRatePerMs = options.capacity / options.refillIntervalMs;

  const middleware: MiddlewareHandler = async (c, next) => {
    const key = keyFn(c);
    const now = clock();
    const existing = buckets.get(key);

    let bucket: Bucket;
    if (!existing) {
      bucket = { tokens: options.capacity, lastRefill: now };
      buckets.set(key, bucket);
    } else {
      const elapsed = now - existing.lastRefill;
      if (elapsed > 0) {
        existing.tokens = Math.min(
          options.capacity,
          existing.tokens + elapsed * refillRatePerMs,
        );
        existing.lastRefill = now;
      }
      bucket = existing;
    }

    if (bucket.tokens < 1) {
      return c.json(
        { error: 'rate_limited', message: 'Too many requests. Try again later.' },
        429,
      );
    }
    bucket.tokens -= 1;
    await next();
    return;
  };

  return {
    middleware,
    reset: () => {
      buckets.clear();
    },
  };
}

export const intakeRateLimiter = createRateLimiter({
  capacity: 60,
  refillIntervalMs: 60_000,
});
