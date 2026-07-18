import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    activityLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";

describe("logActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates activity log entry", async () => {
    (prisma.activityLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "log-1" });
    const { logActivity, ACTIONS } = await import("@/lib/activity-log");

    await logActivity({
      action: ACTIONS.PRODUCT_CREATED,
      actorId: "user-1",
      entityType: "Product",
      entityId: "prod-1",
      metadata: { nom: "Test" },
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0",
    });

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PRODUCT_CREATED",
        actorId: "user-1",
        entityType: "Product",
        entityId: "prod-1",
        ipAddress: "127.0.0.1",
      }),
    });
  });

  it("does not throw on DB error", async () => {
    (prisma.activityLog.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB down"));
    const { logActivity, ACTIONS } = await import("@/lib/activity-log");

    await expect(logActivity({ action: ACTIONS.AUTH_LOGOUT })).resolves.toBeUndefined();
  });

  it("truncates userAgent to 512 chars", async () => {
    (prisma.activityLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "log-2" });
    const { logActivity, ACTIONS } = await import("@/lib/activity-log");
    const longUA = "A".repeat(1000);

    await logActivity({ action: ACTIONS.AUTH_LOGIN_SUCCESS, userAgent: longUA });

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userAgent: "A".repeat(512),
      }),
    });
  });

  it("defaults null for optional fields", async () => {
    (prisma.activityLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "log-3" });
    const { logActivity, ACTIONS } = await import("@/lib/activity-log");

    await logActivity({ action: ACTIONS.AUTH_LOGOUT });

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        entityType: null,
        entityId: null,
        ipAddress: null,
        userAgent: null,
      }),
    });
  });
});

describe("getClientIp", () => {
  it("extracts from x-forwarded-for", async () => {
    const { getClientIp } = await import("@/lib/activity-log");
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", async () => {
    const { getClientIp } = await import("@/lib/activity-log");
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns null if no IP headers", async () => {
    const { getClientIp } = await import("@/lib/activity-log");
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBeNull();
  });
});

describe("getClientUserAgent", () => {
  it("extracts user-agent header", async () => {
    const { getClientUserAgent } = await import("@/lib/activity-log");
    const req = new Request("http://localhost", {
      headers: { "user-agent": "TestBot/1.0" },
    });
    expect(getClientUserAgent(req)).toBe("TestBot/1.0");
  });

  it("returns null if no header", async () => {
    const { getClientUserAgent } = await import("@/lib/activity-log");
    const req = new Request("http://localhost");
    expect(getClientUserAgent(req)).toBeNull();
  });
});
