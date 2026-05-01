import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn() },
    paiement: { aggregate: vi.fn() },
    vente: { aggregate: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { COMPTOIR_SESSION_CLOSED: "COMPTOIR_SESSION_CLOSED" },
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
  montantOuvertureCash: new Decimal(50000), montantOuvertureMobileMoney: new Decimal(0),
  montantFermetureCash: null, montantFermetureMobileMoney: null,
  fermetureAt: null, ouvertureAt: new Date(), notes: null,
  soldeTheoriqueCash: null, soldeTheoriqueMobileMoney: null,
  ecartCash: null, ecartMobileMoney: null,
  user: { id: "user-1", nom: "Test", email: "t@t.com" },
  ventes: [],
};

function mockAggregates() {
  (prisma.paiement.aggregate as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({ _sum: { montant: new Decimal(30000) } })  // espèces
    .mockResolvedValueOnce({ _sum: { montant: new Decimal(0) } })     // mobile money
    .mockResolvedValueOnce({ _sum: { montant: new Decimal(30000) } }); // all payments
  (prisma.vente.aggregate as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ _sum: { total: new Decimal(28000) }, _count: { id: 2 } });
}

describe("GET /api/comptoir/sessions/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/sessions/[id]/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if session not found", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-999" }) });
    expect(res.status).toBe(404);
  });

  it("returns open session with computed soldeTheoriqueCash", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    mockAggregates();

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldeTheoriqueCash).toBeTypeOf("number");
  });

  it("returns closed session with stored soldeTheoriqueCash", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      statut: "FERMEE",
      soldeTheoriqueCash: new Decimal(78000),
      ecartCash: new Decimal(-2000),
    });

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldeTheoriqueCash).toBe(78000);
  });

  it("returns 500 on error", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/comptoir/sessions/[id] (close)", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    PUT = (await import("@/app/api/comptoir/sessions/[id]/route")).PUT;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 75000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if session not found", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 75000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 if already closed", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockOpenSession, statut: "FERMEE" });
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 75000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 if CAISSIER tries to close another's session", async () => {
    mockSession("CAISSIER", "other-user");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 75000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("closes session and computes ecart", async () => {
    mockSession("CAISSIER", "user-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    mockAggregates();
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession, statut: "FERMEE",
      montantFermetureCash: new Decimal(76000), montantFermetureMobileMoney: new Decimal(0),
      soldeTheoriqueCash: new Decimal(78000), soldeTheoriqueMobileMoney: new Decimal(0),
      ecartCash: new Decimal(-2000), ecartMobileMoney: new Decimal(0),
    });

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 76000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ecartCash).toBe(-2000);
  });

  it("ADMIN can close another user's session", async () => {
    mockSession("ADMIN", "admin-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    mockAggregates();
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession, statut: "FERMEE",
      montantFermetureCash: new Decimal(50000), montantFermetureMobileMoney: new Decimal(0),
      soldeTheoriqueCash: new Decimal(78000), soldeTheoriqueMobileMoney: new Decimal(0),
      ecartCash: new Decimal(-28000), ecartMobileMoney: new Decimal(0),
    });

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 50000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montantFermetureCash: 50000, montantFermetureMobileMoney: 0 }) }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(500);
  });
});
