import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    taxe: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    TAXE_CREATED: "TAXE_CREATED",
    TAXE_UPDATED: "TAXE_UPDATED",
    TAXE_DELETED: "TAXE_DELETED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "Test", role },
  });
}

const sampleTaxe = {
  id: "taxe-1",
  nom: "TVA",
  taux: 18,
  active: true,
  ordre: 0,
  parametresId: "default",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/taxes", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/taxes/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns list of taxes for any authenticated user", async () => {
    mockSession("CAISSIER");
    (prisma.taxe.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleTaxe]);

    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].nom).toBe("TVA");
  });

  it("returns empty array if no taxes exist", async () => {
    mockSession("ADMIN");
    (prisma.taxe.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/taxes", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/taxes/route")).POST;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "TVA", taux: 18 }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "TVA", taux: 18 }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data (missing nom)", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taux: 18 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for taux > 100", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "TVA", taux: 150 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates a taxe for ADMIN and returns 201", async () => {
    mockSession("ADMIN");
    const input = { nom: "TVA", taux: 18, active: true, ordre: 0 };
    (prisma.taxe.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "taxe-new",
      ...input,
      parametresId: "default",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data.nom).toBe("TVA");
    expect(prisma.taxe.create).toHaveBeenCalledOnce();
  });
});
