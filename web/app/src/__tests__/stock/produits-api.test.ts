import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    produit: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    categorie: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { PRODUCT_CREATED: "PRODUCT_CREATED", PRODUCT_UPDATED: "PRODUCT_UPDATED", PRODUCT_DEACTIVATED: "PRODUCT_DEACTIVATED" },
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
  codeBarres: "1234567890",
  nom: "Riz 5kg",
  description: "Sac de riz",
  image: null,
  prixAchat: new Decimal(3000),
  prixVente: new Decimal(4500),
  tva: new Decimal(0),
  unite: "unité",
  stockActuel: 50,
  stockMinimum: 5,
  stockMaximum: null,
  actif: true,
  categorieId: "cat-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  categorie: { id: "cat-1", nom: "Alimentaire", couleur: "#22c55e" },
};

// ─── GET /api/produits ──────────────────────────────

describe("GET /api/produits", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/produits/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/produits"));
    expect(res.status).toBe(401);
  });

  it("returns products list for any authenticated user", async () => {
    mockSession("CAISSIER");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockProduit]);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/produits"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].nom).toBe("Riz 5kg");
    expect(body.total).toBe(1);
  });

  it("supports pagination", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const res = await GET(new Request("http://localhost/api/produits?page=2&pageSize=10"));
    expect(res.status).toBe(200);
    expect(prisma.produit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it("filters by category", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/produits?categorieId=cat-1"));
    expect(prisma.produit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categorieId: "cat-1" }),
      })
    );
  });

  it("filters by stock status (alerte)", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/produits?statut=alerte"));
    expect(prisma.produit.count).toHaveBeenCalled();
  });

  it("filters by active status", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/produits?actif=false"));
    expect(prisma.produit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actif: false }),
      })
    );
  });

  it("supports text search", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await GET(new Request("http://localhost/api/produits?recherche=riz"));
    expect(prisma.produit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ nom: expect.objectContaining({ contains: "riz" }) }),
          ]),
        }),
      })
    );
  });
});

// ─── POST /api/produits ─────────────────────────────

describe("POST /api/produits", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/produits/route");
    POST = mod.POST;
  });

  const validBody = {
    nom: "Huile 1L",
    categorieId: "cat-1",
    prixAchat: 2000,
    prixVente: 3000,
    tva: 0,
    unite: "unité",
    stockMinimum: 5,
  };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 if salePrice < purchasePrice", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify({ ...validBody, prixVente: 1000 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid data", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify({ nom: "A" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 if barcode already exists", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduit);

    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify({ ...validBody, codeBarres: "1234567890" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("creates product with valid data for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.categorie.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cat-1" });
    (prisma.produit.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduit,
      nom: validBody.nom,
    });

    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.nom).toBe("Huile 1L");
  });

  it("creates product for MANAGER", async () => {
    mockSession("MANAGER");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.categorie.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cat-1" });
    (prisma.produit.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduit);

    const res = await POST(
      new Request("http://localhost/api/produits", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
  });
});

// ─── GET /api/produits/[id] ─────────────────────────

describe("GET /api/produits/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/produits/[id]/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      new Request("http://localhost/api/produits/prod-1"),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if product not found", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/produits/prod-999"),
      { params: Promise.resolve({ id: "prod-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns product detail for any authenticated user", async () => {
    mockSession("CAISSIER");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduit);
    const res = await GET(
      new Request("http://localhost/api/produits/prod-1"),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("prod-1");
  });
});

// ─── PUT /api/produits/[id] ─────────────────────────

describe("PUT /api/produits/[id]", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/produits/[id]/route");
    PUT = mod.PUT;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await PUT(
      new Request("http://localhost/api/produits/prod-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await PUT(
      new Request("http://localhost/api/produits/prod-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if product not found", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost/api/produits/prod-999", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "prod-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates product for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduit);
    (prisma.produit.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduit,
      nom: "Riz 10kg",
    });

    const res = await PUT(
      new Request("http://localhost/api/produits/prod-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Riz 10kg" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nom).toBe("Riz 10kg");
  });

  it("can deactivate a product (soft delete)", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduit);
    (prisma.produit.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduit,
      actif: false,
    });

    const res = await PUT(
      new Request("http://localhost/api/produits/prod-1", {
        method: "PUT",
        body: JSON.stringify({ actif: false }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.actif).toBe(false);
  });
});

// ─── DELETE /api/produits/[id] ──────────────────────

describe("DELETE /api/produits/[id]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/produits/[id]/route");
    DELETE = mod.DELETE;
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await DELETE(
      new Request("http://localhost/api/produits/prod-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("soft-deletes product (sets actif=false)", async () => {
    mockSession("ADMIN");
    (prisma.produit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduit);
    (prisma.produit.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduit,
      actif: false,
    });

    const res = await DELETE(
      new Request("http://localhost/api/produits/prod-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prod-1" }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.produit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prod-1" },
        data: { actif: false },
      })
    );
  });
});
