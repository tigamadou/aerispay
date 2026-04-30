import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    mouvementStock: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    produit: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { STOCK_MOVEMENT_CREATED: "STOCK_MOVEMENT_CREATED" },
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

const mockProduit = {
  id: "prod-1",
  reference: "PRD-ABC12",
  nom: "Riz 5kg",
  stockActuel: 50,
  stockMinimum: 5,
  actif: true,
  prixAchat: new Decimal(3000),
  prixVente: new Decimal(4500),
};

const mockMouvement = {
  id: "mvt-1",
  type: "ENTREE",
  quantite: 20,
  quantiteAvant: 30,
  quantiteApres: 50,
  motif: null,
  reference: "BL-001",
  createdAt: new Date("2026-01-15"),
  produitId: "prod-1",
  venteId: null,
  produit: { id: "prod-1", nom: "Riz 5kg", reference: "PRD-ABC12" },
};

// ─── GET /api/stock/mouvements ──────────────────────

describe("GET /api/stock/mouvements", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/stock/mouvements/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/stock/mouvements"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await GET(new Request("http://localhost/api/stock/mouvements"));
    expect(res.status).toBe(403);
  });

  it("returns movements list for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.mouvementStock.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockMouvement]);
    (prisma.mouvementStock.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/stock/mouvements"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe("ENTREE");
  });

  it("returns movements for MANAGER", async () => {
    mockSession("MANAGER");
    (prisma.mouvementStock.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.mouvementStock.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await GET(new Request("http://localhost/api/stock/mouvements"));
    expect(res.status).toBe(200);
  });

  it("filters by product", async () => {
    mockSession("ADMIN");
    (prisma.mouvementStock.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.mouvementStock.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/stock/mouvements?produitId=prod-1"));
    expect(prisma.mouvementStock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ produitId: "prod-1" }),
      })
    );
  });

  it("filters by type", async () => {
    mockSession("ADMIN");
    (prisma.mouvementStock.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.mouvementStock.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/stock/mouvements?type=ENTREE"));
    expect(prisma.mouvementStock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "ENTREE" }),
      })
    );
  });
});

// ─── POST /api/stock/mouvements ─────────────────────

describe("POST /api/stock/mouvements", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/stock/mouvements/route");
    POST = mod.POST;
  });

  const validEntree = {
    produitId: "prod-1",
    type: "ENTREE",
    quantite: 20,
    reference: "BL-001",
  };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify(validEntree),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify(validEntree),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify({ produitId: "prod-1", type: "INVALID", quantite: -1 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if PERTE without motif", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify({ produitId: "prod-1", type: "PERTE", quantite: 5 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if AJUSTEMENT without motif", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify({ produitId: "prod-1", type: "AJUSTEMENT", quantite: 5 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 if product not found", async () => {
    mockSession("ADMIN");
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify(validEntree),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 if SORTIE exceeds available stock", async () => {
    mockSession("ADMIN");
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue({ ...mockProduit, stockActuel: 3 }),
          update: vi.fn(),
        },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify({ produitId: "prod-1", type: "SORTIE", quantite: 10 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(422);
  });

  it("creates ENTREE movement and increments stock", async () => {
    mockSession("ADMIN");
    const createdMovement = {
      ...mockMouvement,
      quantiteAvant: 50,
      quantiteApres: 70,
      quantite: 20,
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue(mockProduit),
          update: vi.fn().mockResolvedValue({ ...mockProduit, stockActuel: 70 }),
        },
        mouvementStock: { create: vi.fn().mockResolvedValue(createdMovement) },
      };
      return fn(tx);
    });

    const res = await POST(
      new Request("http://localhost/api/stock/mouvements", {
        method: "POST",
        body: JSON.stringify(validEntree),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.quantiteApres).toBe(70);
  });
});

// ─── GET /api/stock/alertes ─────────────────────────

describe("GET /api/stock/alertes", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/stock/alertes/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/stock/alertes"));
    expect(res.status).toBe(401);
  });

  it("returns products with low stock", async () => {
    mockSession("ADMIN");
    const lowStockProduct = { ...mockProduit, stockActuel: 3 };
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([lowStockProduct]);

    const res = await GET(new Request("http://localhost/api/stock/alertes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});
