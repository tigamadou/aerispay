import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/permissions", () => ({
  requireAuth: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findMany: vi.fn() },
  },
}));

import { requireAuth, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// ─── Helpers ────────────────────────────────────────

function mockAuth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id: "u1", email: "t@t.com", name: "T", role: "ADMIN" },
  });
}

function mockUnauth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: false,
    response: Response.json({ error: "Non authentifié" }, { status: 401 }),
  });
}

function getReq(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/comptoir/discrepancies");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

// ─── Tests ──────────────────────────────────────────

describe("GET /api/comptoir/discrepancies", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/discrepancies/route")).GET;
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  it("renvoie 401 sans authentification", async () => {
    mockUnauth();
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("renvoie 403 sans permission rapports:consulter", async () => {
    mockAuth();
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("renvoie la liste des écarts non nuls", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "s-1",
        statut: "VALIDEE",
        ouvertureAt: new Date(),
        fermetureAt: new Date(),
        ecartsParMode: { ESPECES: { ecart: 500, categorie: "MINEUR" } },
        userId: "u1",
        user: { id: "u1", nom: "Caissier" },
      },
    ]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].sessionId).toBe("s-1");
  });

  it("filtre les sessions avec écarts tous nuls", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "s-1",
        statut: "VALIDEE",
        ouvertureAt: new Date(),
        fermetureAt: new Date(),
        ecartsParMode: { ESPECES: { ecart: 0, categorie: null } },
        userId: "u1",
        user: { id: "u1", nom: "Caissier" },
      },
    ]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("filtre les sessions avec ecartsParMode null", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "s-2",
        statut: "VALIDEE",
        ouvertureAt: new Date(),
        fermetureAt: new Date(),
        ecartsParMode: null,
        userId: "u1",
        user: { id: "u1", nom: "Caissier" },
      },
    ]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("accepte les filtres dateFrom et dateTo", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await GET(getReq({ dateFrom: "2026-01-01", dateTo: "2026-01-31" }));

    expect(prisma.comptoirSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fermetureAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it("accepte le filtre userId", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await GET(getReq({ userId: "u-specific" }));

    expect(prisma.comptoirSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u-specific" }),
      }),
    );
  });

  it("renvoie 500 en cas d'erreur", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });
});
