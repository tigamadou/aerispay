/**
 * Simple in-memory rate limiter for API routes.
 * Tracks request counts per key (typically IP address) within a sliding window.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  maxAttempts: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxAttempts: 5,
  windowMs: 60_000, // 60 seconds
};

/**
 * Creates a rate limiter with its own store.
 * Returns a `check` function that tracks and limits requests per key.
 */
export function createRateLimiter(opts: Partial<RateLimitOptions> = {}) {
  const { maxAttempts, windowMs } = { ...DEFAULT_OPTIONS, ...opts };
  const store = new Map<string, RateLimitEntry>();

  /** Remove expired entries periodically to avoid memory leaks. */
  function cleanup() {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }

  // Run cleanup every 60 seconds
  const cleanupInterval = setInterval(cleanup, 60_000);
  // Allow the process to exit without waiting for this interval
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }

  /**
   * Check whether the given key is rate-limited.
   * Each call increments the counter for the key.
   */
  function check(key: string, now: number = Date.now()): RateLimitResult {
    const existing = store.get(key);

    // If no entry or window expired, start a new window
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      store.set(key, { count: 1, resetAt });
      return { limited: false, remaining: maxAttempts - 1, resetAt };
    }

    // Increment within the current window
    existing.count += 1;

    if (existing.count > maxAttempts) {
      return { limited: true, remaining: 0, resetAt: existing.resetAt };
    }

    return {
      limited: false,
      remaining: maxAttempts - existing.count,
      resetAt: existing.resetAt,
    };
  }

  return { check };
}

/** Singleton rate limiter for authentication endpoints. */
export const authRateLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 60_000,
});
