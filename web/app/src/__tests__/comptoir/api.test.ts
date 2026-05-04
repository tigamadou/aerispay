import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    vente: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    paiement: {
      aggregate: vi.fn(),
    },
    produit: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ligneVente: {
      findMany: vi.fn(),
    },
    mouvementStock: {
      create: vi.fn(),
    },
    mouvementCaisse: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    caisse: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
  computeSoldeTheoriqueLegacy: vi.fn().mockResolvedValue({ cash: 0, mobileMoney: 0 }),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([]),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { COMPTOIR_SESSION_OPENED: "COMPTOIR_SESSION_OPENED", COMPTOIR_SESSION_CLOSED: "COMPTOIR_SESSION_CLOSED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// ─── Helpers ─────────────────────────────────────────

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function mockNoSession() {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

/**
 * Helper: mock $transaction so it executes the callback with a tx
 * that delegates to the outer prisma mocks (findFirst/create).
 * This allows existing tests to keep mocking prisma.comptoirSession.findFirst/create
 * while the route now uses $transaction internally.
 */
function mockTransactionPassthrough() {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
}

const mockOpenSession = {
  id: "session-1",
  ouvertureAt: new Date("2026-04-30T08:00:00Z"),
  fermetureAt: null,
  montantOuvertureCash: 50000,
  montantOuvertureMobileMoney: 0,
  montantFermetureCash: null,
  montantFermetureMobileMoney: null,
  statut: "OUVERTE",
  notes: null,
  userId: "user-1",
};

const mockClosedSession = {
  ...mockOpenSession,
  id: "session-2",
  fermetureAt: new Date("2026-04-30T18:00:00Z"),
  montantFermetureCash: 120000,
  statut: "FERMEE",
};

// ─── POST /api/comptoir/sessions (open session) ────────

describe("POST /api/comptoir/sessions", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/comptoir/sessions/route");
    POST = mod.POST;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("ADMIN can open a session (has comptoir:vendre)", async () => {
    mockSession("ADMIN");
    mockTransactionPassthrough();
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", nom: "Caisse principale", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([{ mode: "ESPECES", solde: 50000 }]);

    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
  });

  it("MANAGER can open a session (has comptoir:vendre)", async () => {
    mockSession("MANAGER");
    mockTransactionPassthrough();
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", nom: "Caisse principale", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([{ mode: "ESPECES", solde: 50000 }]);

    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
  });

  it("creates session with montantOuvertureCash for CAISSIER", async () => {
    mockSession("CAISSIER");
    mockTransactionPassthrough();
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", nom: "Caisse principale", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([{ mode: "ESPECES", solde: 50000 }]);

    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.statut).toBe("OUVERTE");
    expect(body.data.montantOuvertureCash).toBeDefined();
  });

  it("returns 409 if user already has an open session", async () => {
    mockSession("CAISSIER");
    mockTransactionPassthrough();
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([{ mode: "ESPECES", solde: 50000 }]);

    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid data (negative montantOuvertureCash)", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: -100 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing montantOuvertureCash", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 if no active caisse exists", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/caisse/i);
  });

  it("returns 422 if caisse has zero balance", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", nom: "Caisse principale", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/solde/i);
  });

  it("creates session when caisse has positive balance", async () => {
    mockSession("CAISSIER");
    mockTransactionPassthrough();
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", nom: "Caisse principale", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 50000 },
    ]);

    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuvertureCash: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
  });
});

// ─── GET /api/comptoir/sessions ────────────────────────

describe("GET /api/comptoir/sessions", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/comptoir/sessions/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/comptoir/sessions"));
    expect(res.status).toBe(401);
  });

  it("returns sessions list for authenticated user", async () => {
    mockSession("CAISSIER");
    const sessions = [mockOpenSession, mockClosedSession];
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    const res = await GET(new Request("http://localhost/api/comptoir/sessions"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });
});

// ─── PUT /api/comptoir/sessions/[id] (close session) ──

describe("PUT /api/comptoir/sessions/[id]", () => {
  let PUT: (
    req: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/comptoir/sessions/[id]/route");
    PUT = mod.PUT;

    // Default mocks for vente aggregate (used after close for log metadata)
    (prisma.vente.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { total: null },
      _count: { id: 0 },
    });
  });

  const closeBody = { montantFermetureCash: 120000, montantFermetureMobileMoney: 0, notes: "RAS" };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await PUT(
      new Request("http://localhost/api/comptoir/sessions/session-1", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("closes own session for any role", async () => {
    mockSession("CAISSIER", "user-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      montantFermetureCash: 120000, montantFermetureMobileMoney: 0,
      soldeTheoriqueCash: 50000, soldeTheoriqueMobileMoney: 0,
      ecartCash: 70000, ecartMobileMoney: 0,
      fermetureAt: new Date(),
      notes: "RAS",
    });

    const res = await PUT(
      new Request("http://localhost/api/comptoir/sessions/session-1", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("FERMEE");
  });

  it("returns 403 if CAISSIER tries to close another user's session", async () => {
    mockSession("CAISSIER", "user-2");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await PUT(
      new Request("http://localhost/api/comptoir/sessions/session-1", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("ADMIN can close any session", async () => {
    mockSession("ADMIN", "admin-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      montantFermetureCash: 120000, montantFermetureMobileMoney: 0,
      soldeTheoriqueCash: 50000, soldeTheoriqueMobileMoney: 0,
      ecartCash: 70000, ecartMobileMoney: 0,
      fermetureAt: new Date(),
    });

    const res = await PUT(
      new Request("http://localhost/api/comptoir/sessions/session-1", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("MANAGER can close any session", async () => {
    mockSession("MANAGER", "mgr-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      montantFermetureCash: 120000, montantFermetureMobileMoney: 0,
      soldeTheoriqueCash: 50000, soldeTheoriqueMobileMoney: 0,
      ecartCash: 70000, ecartMobileMoney: 0,
      fermetureAt: new Date(),
    });

    const res = await PUT(
      new Request("http://localhost/api/comptoir/sessions/session-1", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 if session not found", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(
      new Request("http://localhost/api/comptoir/sessions/session-999", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-999" }) }
    );
    expect(res.status).toBe(404);
  });
});

// ─── Error paths ────────────────────────────────────

describe("Comptoir error handling", () => {
  it("GET /api/comptoir/sessions returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const { GET } = await import("@/app/api/comptoir/sessions/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("POST /api/comptoir/sessions returns 500 on DB error", async () => {
    mockSession("CAISSIER");
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([{ mode: "ESPECES", solde: 50000 }]);

    // $transaction itself throws, simulating a DB error
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const { POST } = await import("@/app/api/comptoir/sessions/route");
    const res = await POST(new Request("http://localhost/api/comptoir/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ montantOuvertureCash: 50000 }),
    }));
    expect(res.status).toBe(500);
  });
});
