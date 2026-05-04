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
    vi.stubEnv("NODE_ENV", "production");
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
      vi.unstubAllEnvs();
    }
  });

  it("does NOT throw in development without SEED_ADMIN_PASSWORD", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.SEED_ADMIN_PASSWORD;

    try {
      const mod = await import("@/lib/seed/users");
      const mockPrisma = {
        user: { upsert: vi.fn().mockResolvedValue({}) },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(mod.seedProdUsers(mockPrisma as any)).resolves.not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("works in production when SEED_ADMIN_PASSWORD is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_ADMIN_PASSWORD", "SecureP@ss123");

    try {
      const mod = await import("@/lib/seed/users");
      const mockPrisma = {
        user: { upsert: vi.fn().mockResolvedValue({}) },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(mod.seedProdUsers(mockPrisma as any)).resolves.not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
