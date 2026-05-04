import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@prisma/client", () => ({
  Role: { ADMIN: "ADMIN", MANAGER: "MANAGER", CAISSIER: "CAISSIER" },
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("$2a$12$hashed"),
}));

describe("seed users — production password safety (P1-010)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws in production if SEED_ADMIN_PASSWORD is not set", async () => {
    // Set NODE_ENV to production, unset SEED_ADMIN_PASSWORD
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSeedPwd = process.env.SEED_ADMIN_PASSWORD;
    process.env.NODE_ENV = "production";
    delete process.env.SEED_ADMIN_PASSWORD;

    try {
      const mod = await import("@/lib/seed/users");
      const mockPrisma = {
        user: { upsert: vi.fn() },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(mod.seedProdUsers(mockPrisma as any)).rejects.toThrow(
        /SEED_ADMIN_PASSWORD/
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalSeedPwd !== undefined) {
        process.env.SEED_ADMIN_PASSWORD = originalSeedPwd;
      }
    }
  });

  it("does NOT throw in development without SEED_ADMIN_PASSWORD", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSeedPwd = process.env.SEED_ADMIN_PASSWORD;
    process.env.NODE_ENV = "development";
    delete process.env.SEED_ADMIN_PASSWORD;

    try {
      const mod = await import("@/lib/seed/users");
      const mockPrisma = {
        user: { upsert: vi.fn().mockResolvedValue({}) },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(mod.seedProdUsers(mockPrisma as any)).resolves.not.toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalSeedPwd !== undefined) {
        process.env.SEED_ADMIN_PASSWORD = originalSeedPwd;
      }
    }
  });

  it("works in production when SEED_ADMIN_PASSWORD is set", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSeedPwd = process.env.SEED_ADMIN_PASSWORD;
    process.env.NODE_ENV = "production";
    process.env.SEED_ADMIN_PASSWORD = "SecureP@ss123";

    try {
      const mod = await import("@/lib/seed/users");
      const mockPrisma = {
        user: { upsert: vi.fn().mockResolvedValue({}) },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(mod.seedProdUsers(mockPrisma as any)).resolves.not.toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalSeedPwd !== undefined) {
        process.env.SEED_ADMIN_PASSWORD = originalSeedPwd;
      } else {
        delete process.env.SEED_ADMIN_PASSWORD;
      }
    }
  });
});
