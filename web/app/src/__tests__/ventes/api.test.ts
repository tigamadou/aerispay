import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

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
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
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
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SALE_COMPLETED: "SALE_COMPLETED", SALE_CANCELLED: "SALE_CANCELLED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

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

const mockProduit = {
  id: "prod-1",
  reference: "REF001",
  codeBarres: "3456789012345",
  nom: "Savon liquide",
  prixVente: 1500,
  tva: 18,
  stockActuel: 50,
  actif: true,
};

const mockVente = {
  id: "vente-1",
  numero: "VTE-2026-00001",
  dateVente: new Date("2026-04-30T10:00:00Z"),
  sousTotal: 3000,
  remise: 0,
  tva: 540,
  total: 3540,
  statut: "VALIDEE",
  nomClient: null,
  notesCaissier: null,
  sessionId: "session-1",
  userId: "user-1",
  lignes: [
    {
      id: "ligne-1",
      quantite: 2,
      prixUnitaire: 1500,
      remise: 0,
      tva: 270,
      sousTotal: 3000,
      venteId: "vente-1",
      produitId: "prod-1",
      produit: mockProduit,
    },
  ],
  paiements: [
    { id: "paie-1", mode: "ESPECES", montant: 3540, reference: null, venteId: "vente-1" },
  ],
};

const mockVenteListRow = {
  id: "vente-1",
  numero: "VTE-2026-00001",
  dateVente: new Date("2026-04-30T10:00:00Z"),
  total: 3540,
  statut: "VALIDEE",
  userId: "user-1",
  caissier: { id: "user-1", nom: "Test" },
  paiements: [{ mode: "ESPECES", montant: 3540 }],
  lignes: [{ quantite: 2, sousTotal: 3000 }],
};

const mockVenteDetail = {
  ...mockVente,
  lignes: [
    {
      id: "ligne-1",
      quantite: 2,
      prixUnitaire: 1500,
      remise: 0,
      tva: 18,
      sousTotal: 3000,
      venteId: "vente-1",
      produitId: "prod-1",
      produit: { id: "prod-1", nom: "Savon liquide", reference: "REF001" },
    },
  ],
  session: { id: "session-1", ouvertureAt: new Date("2026-04-30T08:00:00Z") },
  caissier: { id: "user-1", nom: "Test", email: "test@aerispay.com" },
};

// ─── GET /api/ventes ─────────────────────────────────

describe("GET /api/ventes", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/ventes/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/ventes"));
    expect(res.status).toBe(401);
  });

  it("restricts CAISSIER to own sales only", async () => {
    mockSession("CAISSIER", "caissier-99");
    (prisma.vente.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockVenteListRow]);
    (prisma.vente.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/ventes"));
    expect(res.status).toBe(200);
    expect(prisma.vente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "caissier-99" },
      })
    );
  });

  it("allows ADMIN to filter by userId", async () => {
    mockSession("ADMIN");
    (prisma.vente.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.vente.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/ventes?userId=other-user"));
    expect(prisma.vente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "other-user" }),
      })
    );
  });

  it("ignores userId filter for CAISSIER (always own id)", async () => {
    mockSession("CAISSIER", "caissier-1");
    (prisma.vente.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.vente.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/ventes?userId=admin-wants-spoof"));
    expect(prisma.vente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "caissier-1" },
      })
    );
  });

  it("applies dateFrom and dateTo filters for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.vente.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.vente.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(
      new Request("http://localhost/api/ventes?dateFrom=2026-04-01&dateTo=2026-04-30")
    );
    expect(prisma.vente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dateVente: expect.objectContaining({
            gte: new Date("2026-04-01"),
            lte: expect.any(Date) as Date,
          }),
        }),
      })
    );
  });

  it("returns paginated metadata", async () => {
    mockSession("MANAGER");
    (prisma.vente.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockVenteListRow]);
    (prisma.vente.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const res = await GET(new Request("http://localhost/api/ventes?page=2&pageSize=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(body.total).toBe(50);
    expect(body.data).toHaveLength(1);
    expect(prisma.vente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it("returns 500 when Prisma fails", async () => {
    mockSession("ADMIN");
    (prisma.vente.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));

    const res = await GET(new Request("http://localhost/api/ventes"));
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/ventes ─────────────────────────────────

describe("POST /api/ventes", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/ventes/route");
    POST = mod.POST;
  });

  const validVenteBody = {
    sessionId: "session-1",
    lignes: [
      { produitId: "prod-1", quantite: 2, prixUnitaire: 1500, tva: 18, remise: 0 },
    ],
    paiements: [{ mode: "ESPECES", montant: 3540 }],
    remise: 0,
  };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/ventes", {
        method: "POST",
        body: JSON.stringify(validVenteBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("creates sale with lines, payments and stock decrement via transaction", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue(mockVente);

    const res = await POST(
      new Request("http://localhost/api/ventes", {
        method: "POST",
        body: JSON.stringify(validVenteBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("returns 422 if stock insufficient for a product", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("Stock insuffisant pour le produit : Savon liquide"), {
        code: "STOCK_INSUFFISANT",
      })
    );

    const res = await POST(
      new Request("http://localhost/api/ventes", {
        method: "POST",
        body: JSON.stringify({
          ...validVenteBody,
          lignes: [{ produitId: "prod-1", quantite: 999, prixUnitaire: 1500, tva: 18, remise: 0 }],
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid data with no lines", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/ventes", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          lignes: [],
          paiements: [{ mode: "ESPECES", montant: 100 }],
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid data with no payments", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/ventes", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          lignes: [{ produitId: "prod-1", quantite: 1, prixUnitaire: 1500, tva: 18, remise: 0 }],
          paiements: [],
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 if session is not open", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockClosedSession);

    const res = await POST(
      new Request("http://localhost/api/ventes", {
        method: "POST",
        body: JSON.stringify(validVenteBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/session/i);
  });
});

// ─── GET /api/ventes/[id] ─────────────────────────────

describe("GET /api/ventes/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/ventes/[id]/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/ventes/v1"), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 if sale not found", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/ventes/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns sale detail when found", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockVenteDetail);

    const res = await GET(new Request("http://localhost/api/ventes/vente-1"), {
      params: Promise.resolve({ id: "vente-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.numero).toBe("VTE-2026-00001");
    expect(body.data.lignes).toHaveLength(1);
  });

  it("returns 500 when Prisma fails", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db"));

    const res = await GET(new Request("http://localhost/api/ventes/v1"), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/ventes/[id]/annuler ────────────────────

describe("POST /api/ventes/[id]/annuler", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/ventes/[id]/annuler/route");
    POST = mod.POST;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 if CAISSIER tries to cancel", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("ADMIN can cancel a sale", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockVente);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockVente,
      statut: "ANNULEE",
    });

    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("ANNULEE");
  });

  it("MANAGER can cancel a sale", async () => {
    mockSession("MANAGER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockVente);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockVente,
      statut: "ANNULEE",
    });

    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("runs cancellation in a transaction", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockVente);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockVente,
      statut: "ANNULEE",
    });

    await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("returns 404 if sale not found", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/ventes/vente-999/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 if sale already cancelled", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockVente,
      statut: "ANNULEE",
    });

    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("executes transaction: cancels sale + restores stock + creates RETOUR movements", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockVente);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        vente: {
          update: vi.fn().mockResolvedValue({
            ...mockVente,
            statut: "ANNULEE",
            lignes: mockVente.lignes.map((l) => ({
              ...l,
              produit: { id: l.produitId, nom: "Savon", stockActuel: 50 },
            })),
            paiements: mockVente.paiements,
            caissier: { id: "user-1", nom: "Test" },
          }),
        },
        produit: { update: vi.fn() },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("ANNULEE");
  });

  it("returns 500 on unexpected error", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await POST(
      new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "vente-1" }) }
    );
    expect(res.status).toBe(500);
  });
});
