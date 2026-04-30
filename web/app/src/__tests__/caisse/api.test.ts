import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    caisseSession: {
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
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { CASH_SESSION_OPENED: "CASH_SESSION_OPENED", CASH_SESSION_CLOSED: "CASH_SESSION_CLOSED" },
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

const mockOpenSession = {
  id: "session-1",
  ouvertureAt: new Date("2026-04-30T08:00:00Z"),
  fermetureAt: null,
  montantOuverture: 50000,
  montantFermeture: null,
  statut: "OUVERTE",
  notes: null,
  userId: "user-1",
};

const mockClosedSession = {
  ...mockOpenSession,
  id: "session-2",
  fermetureAt: new Date("2026-04-30T18:00:00Z"),
  montantFermeture: 120000,
  statut: "FERMEE",
};

// ─── POST /api/caisse/sessions (open session) ────────

describe("POST /api/caisse/sessions", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/caisse/sessions/route");
    POST = mod.POST;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuverture: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 if ADMIN tries to open a session", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuverture: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 if MANAGER tries to open a session", async () => {
    mockSession("MANAGER");
    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuverture: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("creates session with montantOuverture for CAISSIER", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisseSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuverture: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.statut).toBe("OUVERTE");
    expect(body.data.montantOuverture).toBeDefined();
  });

  it("returns 409 if user already has an open session", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuverture: 50000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid data (negative montantOuverture)", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({ montantOuverture: -100 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing montantOuverture", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/caisse/sessions", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/caisse/sessions ────────────────────────

describe("GET /api/caisse/sessions", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/caisse/sessions/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/caisse/sessions"));
    expect(res.status).toBe(401);
  });

  it("returns sessions list for authenticated user", async () => {
    mockSession("CAISSIER");
    const sessions = [mockOpenSession, mockClosedSession];
    (prisma.caisseSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    const res = await GET(new Request("http://localhost/api/caisse/sessions"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });
});

// ─── PUT /api/caisse/sessions/[id] (close session) ──

describe("PUT /api/caisse/sessions/[id]", () => {
  let PUT: (
    req: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/caisse/sessions/[id]/route");
    PUT = mod.PUT;

    // Default mocks for solde théorique computation
    (prisma.paiement.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { montant: null },
    });
    (prisma.vente.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { total: null },
    });
  });

  const closeBody = { montantFermeture: 120000, notes: "RAS" };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await PUT(
      new Request("http://localhost/api/caisse/sessions/session-1", {
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
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.caisseSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      montantFermeture: 120000,
      fermetureAt: new Date(),
      notes: "RAS",
    });

    const res = await PUT(
      new Request("http://localhost/api/caisse/sessions/session-1", {
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
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);

    const res = await PUT(
      new Request("http://localhost/api/caisse/sessions/session-1", {
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
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.caisseSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      montantFermeture: 120000,
      fermetureAt: new Date(),
    });

    const res = await PUT(
      new Request("http://localhost/api/caisse/sessions/session-1", {
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
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.caisseSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      montantFermeture: 120000,
      fermetureAt: new Date(),
    });

    const res = await PUT(
      new Request("http://localhost/api/caisse/sessions/session-1", {
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
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(
      new Request("http://localhost/api/caisse/sessions/session-999", {
        method: "PUT",
        body: JSON.stringify(closeBody),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "session-999" }) }
    );
    expect(res.status).toBe(404);
  });
});
