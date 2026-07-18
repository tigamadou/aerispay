import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/permissions", () => ({
  requireAuth: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/services/cash-movement", () => ({
  listMovements: vi.fn(),
  computeSoldeTheoriqueParMode: vi.fn(),
}));

import { requireAuth, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { listMovements, computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

// ─── Helpers ────────────────────────────────────────

function mockAuth(role = "ADMIN") {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id: "u1", email: "t@t.com", name: "T", role },
  });
}

function mockUnauth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: false,
    response: Response.json({ error: "Non authentifié" }, { status: 401 }),
  });
}

const ctx = { params: Promise.resolve({ id: "s-1" }) };

function getReq(): Request {
  return new Request("http://localhost/api/comptoir/sessions/s-1/z-report");
}

const fakeSession = {
  id: "s-1",
  statut: "VALIDEE",
  user: { id: "u1", nom: "Caissier", email: "c@t.com" },
  valideur: { id: "u2", nom: "Manager" },
  ouvertureAt: new Date("2026-01-01T08:00:00Z"),
  fermetureAt: new Date("2026-01-01T18:00:00Z"),
  demandeCloturAt: new Date("2026-01-01T17:55:00Z"),
  montantOuvertureCash: 50000,
  montantOuvertureMobileMoney: 0,
  motifForceClose: null,
  declarationsCaissier: { ESPECES: 60000 },
  declarationsValideur: { ESPECES: 60000 },
  ecartsParMode: { ESPECES: { ecart: 0, categorie: null } },
  hashIntegrite: "abc123",
  hashSessionPrecedente: "",
  ventes: [
    { id: "v1", numero: "V-001", total: 10000, dateVente: new Date("2026-01-01T10:00:00Z") },
  ],
  sessionCorrective: null,
};

// ─── Tests ──────────────────────────────────────────

describe("GET /api/comptoir/sessions/[id]/z-report", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/sessions/[id]/z-report/route")).GET;
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (listMovements as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("renvoie 401 sans authentification", async () => {
    mockUnauth();
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("renvoie 403 sans permission rapports:consulter", async () => {
    mockAuth();
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si la session n'existe pas", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(404);
  });

  it("renvoie 422 si la session est OUVERTE", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeSession,
      statut: "OUVERTE",
    });

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("OUVERTE");
  });

  it("renvoie le Z de caisse pour une session VALIDEE", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSession);

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.session.id).toBe("s-1");
    expect(body.data.ventes.nombre).toBe(1);
    expect(body.data.ventes.total).toBe(10000);
  });

  it("renvoie le Z de caisse pour une session FORCEE", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeSession,
      statut: "FORCEE",
    });

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
  });

  it("inclut les données de correction si sessionCorrective existe", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeSession,
      sessionCorrective: {
        id: "corr-1",
        notes: "Correction",
        hashIntegrite: "hash-corr",
        mouvementsCaisse: [
          { id: "mc1", type: "CORRECTION", mode: "ESPECES", montant: 500, motif: "Ajust", createdAt: new Date() },
        ],
      },
    });

    const res = await GET(getReq(), ctx);
    const body = await res.json();
    expect(body.data.correction).not.toBeNull();
    expect(body.data.correction.id).toBe("corr-1");
    expect(body.data.correction.mouvements).toHaveLength(1);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(500);
  });
});
