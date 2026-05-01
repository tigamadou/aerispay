import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: {
      findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(),
      create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(),
    },
    mouvementCaisse: { findMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    seuilCaisse: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    INTEGRITY_CHECK_PERFORMED: "INTEGRITY_CHECK_PERFORMED",
    SESSION_CORRECTED: "SESSION_CORRECTED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/integrity", () => ({
  verifySessionIntegrity: vi.fn().mockResolvedValue({
    valid: true, storedHash: "a".repeat(64), computedHash: "a".repeat(64),
  }),
  computeHashForSession: vi.fn().mockResolvedValue("b".repeat(64)),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
  listMovements: vi.fn().mockResolvedValue([]),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) => {
    const d: Record<string, number> = { THRESHOLD_RECURRING_COUNT: 3, THRESHOLD_RECURRING_PERIOD_DAYS: 7 };
    return d[id] ?? 0;
  }),
}));

vi.mock("bcryptjs", () => ({
  compare: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { verifySessionIntegrity } from "@/lib/services/integrity";

function mockUser(role: Role, id = "admin-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "a@t.com", name: "Admin", role },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "s-1" }) };

// ─── VERIFY ─────────────────────────────────────────

describe("POST /api/comptoir/sessions/[id]/verify", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/verify/route")).POST;
  });

  it("returns 403 for CAISSIER", async () => {
    mockUser("CAISSIER", "c-1");
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(403);
  });

  it("MANAGER can verify", async () => {
    mockUser("MANAGER", "m-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE",
    });
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(true);
  });

  it("returns 422 for OUVERTE session", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE",
    });
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns valid:false when hash mismatch", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE",
    });
    (verifySessionIntegrity as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false, storedHash: "a".repeat(64), computedHash: "b".repeat(64),
    });
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(false);
  });
});

// ─── CORRECT ────────────────────────────────────────

describe("POST /api/comptoir/sessions/[id]/correct", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/correct/route")).POST;
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      motDePasse: "$2a$12$hashed",
    });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE", userId: "c-1", sessionCorrective: null,
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );
    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sc-1", fermetureAt: new Date(),
    });
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sc-1", userId: "admin-1", ouvertureAt: new Date(),
      declarationsCaissier: null, declarationsValideur: null, ecartsParMode: null,
    });
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns 403 for MANAGER", async () => {
    mockUser("MANAGER", "m-1");
    const res = await POST(jsonReq({
      motif: "Correction erreur de comptage",
      motDePasse: "Admin@1234",
      mouvements: [{ mode: "ESPECES", montant: -500, motif: "Correction" }],
    }), ctx);
    expect(res.status).toBe(403);
  });

  it("ADMIN creates corrective session", async () => {
    mockUser("ADMIN");
    const res = await POST(jsonReq({
      motif: "Correction erreur de comptage constatée",
      motDePasse: "Admin@1234",
      mouvements: [{ mode: "ESPECES", montant: -500, motif: "Correction excédent" }],
    }), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.correctiveSessionId).toBeDefined();
    expect(body.data.hash).toBeDefined();
  });

  it("returns 422 if session already corrected", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE", userId: "c-1",
      sessionCorrective: { id: "sc-existing" },
    });
    const res = await POST(jsonReq({
      motif: "Tentative double correction",
      motDePasse: "Admin@1234",
      mouvements: [{ mode: "ESPECES", montant: -500, motif: "Correction" }],
    }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns 422 for OUVERTE session", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", userId: "c-1", sessionCorrective: null,
    });
    const res = await POST(jsonReq({
      motif: "Correction sur session ouverte",
      motDePasse: "Admin@1234",
      mouvements: [{ mode: "ESPECES", montant: -500, motif: "Correction" }],
    }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns 401 on wrong password", async () => {
    mockUser("ADMIN");
    const { compare } = await import("bcryptjs");
    (compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await POST(jsonReq({
      motif: "Correction erreur de comptage",
      motDePasse: "wrong",
      mouvements: [{ mode: "ESPECES", montant: -500, motif: "Correction" }],
    }), ctx);
    expect(res.status).toBe(401);
  });
});

// ─── Z-REPORT ───────────────────────────────────────

describe("GET /api/comptoir/sessions/[id]/z-report", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/sessions/[id]/z-report/route")).GET;
  });

  it("returns 403 for CAISSIER", async () => {
    mockUser("CAISSIER", "c-1");
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(403);
  });

  it("MANAGER gets Z report", async () => {
    mockUser("MANAGER", "m-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE",
      ouvertureAt: new Date(), fermetureAt: new Date(), demandeCloturAt: new Date(),
      montantOuvertureCash: new Decimal(50000), montantOuvertureMobileMoney: new Decimal(0),
      declarationsCaissier: { ESPECES: 78000 },
      declarationsValideur: { ESPECES: 78000 },
      ecartsParMode: { ESPECES: { ecart: 0, categorie: null } },
      hashIntegrite: "a".repeat(64), hashSessionPrecedente: null,
      motifForceClose: null,
      user: { id: "c-1", nom: "Caissier", email: "c@t.com" },
      valideur: { id: "m-1", nom: "Manager" },
      ventes: [{ id: "v-1", numero: "VTE-2026-00001", total: new Decimal(28000), dateVente: new Date() }],
      sessionCorrective: null,
    });
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.session).toBeDefined();
    expect(body.data.ventes.nombre).toBe(1);
    expect(body.data.integrite.hash).toBeDefined();
    expect(body.data.correction).toBeNull();
  });

  it("returns 422 for OUVERTE session", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE",
    });
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(422);
  });
});

// ─── DISCREPANCIES ──────────────────────────────────

describe("GET /api/comptoir/discrepancies", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/discrepancies/route")).GET;
  });

  it("returns 403 for CAISSIER", async () => {
    mockUser("CAISSIER", "c-1");
    const res = await GET(new Request("http://localhost/api/comptoir/discrepancies"));
    expect(res.status).toBe(403);
  });

  it("MANAGER gets discrepancies", async () => {
    mockUser("MANAGER", "m-1");
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "s-1", statut: "VALIDEE", ouvertureAt: new Date(), fermetureAt: new Date(),
        ecartsParMode: { ESPECES: { ecart: -2000, categorie: "MOYEN" } },
        userId: "c-1", user: { id: "c-1", nom: "Caissier" },
      },
      {
        id: "s-2", statut: "VALIDEE", ouvertureAt: new Date(), fermetureAt: new Date(),
        ecartsParMode: { ESPECES: { ecart: 0, categorie: null } },
        userId: "c-2", user: { id: "c-2", nom: "Autre" },
      },
    ]);
    const res = await GET(new Request("http://localhost/api/comptoir/discrepancies"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only session with non-zero ecart
    expect(body.data).toHaveLength(1);
    expect(body.data[0].sessionId).toBe("s-1");
  });
});

// ─── RECURRING DISCREPANCIES ────────────────────────

describe("GET /api/comptoir/discrepancies/recurring", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/discrepancies/recurring/route")).GET;
  });

  it("returns 403 for CAISSIER", async () => {
    mockUser("CAISSIER", "c-1");
    const res = await GET(new Request("http://localhost/api/comptoir/discrepancies/recurring"));
    expect(res.status).toBe(403);
  });

  it("returns recurring cashiers above threshold", async () => {
    mockUser("ADMIN");
    const now = new Date();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "s-1", userId: "c-1", fermetureAt: now, ecartsParMode: { ESPECES: { ecart: -500 } }, user: { id: "c-1", nom: "Moussa", email: "m@t.com" } },
      { id: "s-2", userId: "c-1", fermetureAt: now, ecartsParMode: { ESPECES: { ecart: -300 } }, user: { id: "c-1", nom: "Moussa", email: "m@t.com" } },
      { id: "s-3", userId: "c-1", fermetureAt: now, ecartsParMode: { ESPECES: { ecart: 200 } }, user: { id: "c-1", nom: "Moussa", email: "m@t.com" } },
      { id: "s-4", userId: "c-2", fermetureAt: now, ecartsParMode: { ESPECES: { ecart: -100 } }, user: { id: "c-2", nom: "Ali", email: "a@t.com" } },
    ]);
    const res = await GET(new Request("http://localhost/api/comptoir/discrepancies/recurring"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // c-1 has 3 discrepancies (>= threshold 3), c-2 has 1 (< threshold)
    expect(body.data.caissiers).toHaveLength(1);
    expect(body.data.caissiers[0].user.id).toBe("c-1");
    expect(body.data.caissiers[0].count).toBe(3);
  });
});
