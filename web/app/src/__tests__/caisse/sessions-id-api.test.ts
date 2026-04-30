import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    caisseSession: { findUnique: vi.fn(), update: vi.fn() },
    paiement: { aggregate: vi.fn() },
    vente: { aggregate: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { CASH_SESSION_CLOSED: "CASH_SESSION_CLOSED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

const mockOpenSession = {
  id: "s-1", userId: "user-1", statut: "OUVERTE",
  montantOuverture: new Decimal(50000), montantFermeture: null,
  fermetureAt: null, ouvertureAt: new Date(), notes: null,
  soldeTheorique: null, ecartCaisse: null,
  user: { id: "user-1", nom: "Test", email: "t@t.com" },
  ventes: [],
};

function mockAggregates() {
  (prisma.paiement.aggregate as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({ _sum: { montant: new Decimal(30000) } })  // espèces
    .mockResolvedValueOnce({ _sum: { montant: new Decimal(30000) } }); // all payments
  (prisma.vente.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
    _sum: { total: new Decimal(28000) },
  });
}

describe("GET /api/caisse/sessions/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/caisse/sessions/[id]/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if session not found", async () => {
    mockSession("ADMIN");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-999" }) });
    expect(res.status).toBe(404);
  });

  it("returns open session with computed soldeTheorique", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    mockAggregates();

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldeTheorique).toBeTypeOf("number");
  });

  it("returns closed session with stored soldeTheorique", async () => {
    mockSession("ADMIN");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      soldeTheorique: new Decimal(78000),
      ecartCaisse: new Decimal(-2000),
    });

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldeTheorique).toBe(78000);
  });

  it("returns 500 on error", async () => {
    mockSession("ADMIN");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/caisse/sessions/[id] (close)", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    PUT = (await import("@/app/api/caisse/sessions/[id]/route")).PUT;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 75000 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if session not found", async () => {
    mockSession("ADMIN");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 75000 }) }),
      { params: Promise.resolve({ id: "s-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 if already closed", async () => {
    mockSession("ADMIN");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockOpenSession, statut: "FERMEE" });
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 75000 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 if CAISSIER tries to close another's session", async () => {
    mockSession("CAISSIER", "other-user");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 75000 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("closes session and computes ecart", async () => {
    mockSession("CAISSIER", "user-1");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    mockAggregates();
    (prisma.caisseSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession, statut: "FERMEE",
      montantFermeture: new Decimal(76000),
      soldeTheorique: new Decimal(78000),
      ecartCaisse: new Decimal(-2000),
    });

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 76000 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ecartCaisse).toBe(-2000);
  });

  it("ADMIN can close another user's session", async () => {
    mockSession("ADMIN", "admin-1");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    mockAggregates();
    (prisma.caisseSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession, statut: "FERMEE",
      montantFermeture: new Decimal(50000),
      soldeTheorique: new Decimal(78000),
      ecartCaisse: new Decimal(-28000),
    });

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 50000 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermeture: 50000 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(500);
  });
});
