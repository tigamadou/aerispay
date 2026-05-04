import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    mouvementCaisse: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function getReq(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/comptoir/movements");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

const fakeMouvements = [
  {
    id: "mv-1",
    type: "VENTE",
    mode: "ESPECES",
    montant: 5000,
    motif: null,
    reference: null,
    createdAt: new Date("2026-05-01T10:00:00Z"),
    session: { id: "s-1", userId: "user-1" },
    auteur: { id: "user-1", nom: "Alice" },
    vente: { id: "v-1", numero: "V-001" },
  },
  {
    id: "mv-2",
    type: "RETRAIT",
    mode: "ESPECES",
    montant: -2000,
    motif: "Retrait courant",
    reference: null,
    createdAt: new Date("2026-05-01T11:00:00Z"),
    session: { id: "s-1", userId: "user-1" },
    auteur: { id: "user-1", nom: "Alice" },
    vente: null,
  },
];

describe("GET /api/comptoir/movements", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/movements/route")).GET;
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMouvements);
    (prisma.mouvementCaisse.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
  });

  // ─── Auth ─────────────────────────────────────────

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  // ─── Basic listing ────────────────────────────────

  it("ADMIN sees all movements", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(2);
  });

  it("MANAGER sees all movements", async () => {
    mockSession("MANAGER");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it("CAISSIER sees only own session movements", async () => {
    mockSession("CAISSIER", "user-1");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    // Verify the where clause filters by session.userId
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: expect.objectContaining({ userId: "user-1" }),
        }),
      }),
    );
  });

  // ─── Filters ──────────────────────────────────────

  it("filters by type", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq({ type: "RETRAIT" }));
    expect(res.status).toBe(200);
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "RETRAIT" }),
      }),
    );
  });

  it("filters by mode", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq({ mode: "ESPECES" }));
    expect(res.status).toBe(200);
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mode: "ESPECES" }),
      }),
    );
  });

  it("filters by sessionId", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq({ sessionId: "s-1" }));
    expect(res.status).toBe(200);
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionId: "s-1" }),
      }),
    );
  });

  it("filters by date range", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq({
      from: "2026-05-01",
      to: "2026-05-02",
    }));
    expect(res.status).toBe(200);
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  // ─── Pagination ───────────────────────────────────

  it("paginates with page and limit", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq({ page: "2", limit: "10" }));
    expect(res.status).toBe(200);
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it("uses default pagination (page 1, limit 50)", async () => {
    mockSession("ADMIN");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
      }),
    );
  });

  // ─── Error handling ───────────────────────────────

  it("returns 500 on unexpected error", async () => {
    mockSession("ADMIN");
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });
});
