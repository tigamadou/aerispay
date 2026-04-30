import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    activityLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function mockNoSession() {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

const mockLog = {
  id: "log-1",
  action: "PRODUCT_CREATED",
  entityType: "Product",
  entityId: "prod-1",
  metadata: { nom: "Riz 5kg" },
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-04-29T10:00:00Z"),
  actorId: "user-1",
  actor: { id: "user-1", nom: "Admin", email: "admin@aerispay.com" },
};

describe("GET /api/activity-logs", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/activity-logs/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/activity-logs"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await GET(new Request("http://localhost/api/activity-logs"));
    expect(res.status).toBe(403);
  });

  it("returns logs for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockLog]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/activity-logs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].action).toBe("PRODUCT_CREATED");
  });

  it("returns logs for MANAGER", async () => {
    mockSession("MANAGER");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await GET(new Request("http://localhost/api/activity-logs"));
    expect(res.status).toBe(200);
  });

  it("supports pagination", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const res = await GET(new Request("http://localhost/api/activity-logs?page=2&pageSize=10"));
    expect(res.status).toBe(200);
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it("filters by action", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/activity-logs?action=PRODUCT_CREATED"));
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: "PRODUCT_CREATED" }),
      })
    );
  });

  it("filters by actorId", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/activity-logs?actorId=user-1"));
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actorId: "user-1" }),
      })
    );
  });

  it("filters by date range", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/activity-logs?dateDebut=2026-04-01&dateFin=2026-04-30"));
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("filters by entityType", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/activity-logs?entityType=Product"));
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: "Product" }),
      })
    );
  });
});
