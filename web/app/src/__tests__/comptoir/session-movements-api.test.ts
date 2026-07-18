import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/permissions", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/services/cash-movement", () => ({
  listMovements: vi.fn(),
}));

import { requireAuth } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { listMovements } from "@/lib/services/cash-movement";

// ─── Helpers ────────────────────────────────────────

function mockAuth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id: "u1", email: "t@t.com", name: "T", role: "CAISSIER" },
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
  return new Request("http://localhost/api/comptoir/sessions/s-1/movements");
}

// ─── Tests ──────────────────────────────────────────

describe("GET /api/comptoir/sessions/[id]/movements", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/sessions/[id]/movements/route")).GET;
  });

  it("renvoie 401 sans authentification", async () => {
    mockUnauth();
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("renvoie 404 si la session n'existe pas", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session introuvable");
  });

  it("renvoie la liste des mouvements pour une session existante", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1" });

    const fakeMovements = [
      { id: "m1", type: "APPORT", mode: "ESPECES", montant: 5000, createdAt: new Date() },
      { id: "m2", type: "VENTE", mode: "ESPECES", montant: 2750, createdAt: new Date() },
    ];
    (listMovements as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(listMovements).toHaveBeenCalledWith("s-1");
  });

  it("renvoie 500 en cas d'erreur inattendue", async () => {
    mockAuth();
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Erreur serveur");
  });
});
