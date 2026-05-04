import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      const result = limiter.check("127.0.0.1", now);
      expect(result.limited).toBe(false);
    }
  });

  it("blocks the 6th request from the same IP within the window", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const now = Date.now();

    // 5 allowed requests
    for (let i = 0; i < 5; i++) {
      limiter.check("127.0.0.1", now);
    }

    // 6th should be limited
    const result = limiter.check("127.0.0.1", now);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const now = Date.now();

    // Exhaust the limit
    for (let i = 0; i < 6; i++) {
      limiter.check("127.0.0.1", now);
    }

    // After window expires, should be allowed again
    const afterExpiry = now + 60_001;
    const result = limiter.check("127.0.0.1", afterExpiry);
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(4); // maxAttempts - 1
  });

  it("tracks different IPs independently", () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const now = Date.now();

    // Exhaust IP A
    limiter.check("192.168.1.1", now);
    limiter.check("192.168.1.1", now);
    const blockedA = limiter.check("192.168.1.1", now);
    expect(blockedA.limited).toBe(true);

    // IP B should still be allowed
    const resultB = limiter.check("192.168.1.2", now);
    expect(resultB.limited).toBe(false);
  });

  it("returns correct remaining count", () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    const now = Date.now();

    expect(limiter.check("ip", now).remaining).toBe(2);
    expect(limiter.check("ip", now).remaining).toBe(1);
    expect(limiter.check("ip", now).remaining).toBe(0);
    expect(limiter.check("ip", now).limited).toBe(true);
  });
});
