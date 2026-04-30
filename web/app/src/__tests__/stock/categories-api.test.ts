import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    categorie: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    produit: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
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

const mockCategorie = {
  id: "cat-1",
  nom: "Alimentaire",
  description: "Produits alimentaires",
  couleur: "#22c55e",
  createdAt: new Date("2026-01-01"),
  _count: { produits: 5 },
};

// ─── GET /api/categories ────────────────────────────

describe("GET /api/categories", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/categories/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/categories"));
    expect(res.status).toBe(401);
  });

  it("returns categories list for any authenticated user", async () => {
    mockSession("CAISSIER");
    (prisma.categorie.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCategorie]);

    const res = await GET(new Request("http://localhost/api/categories"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].nom).toBe("Alimentaire");
  });
});

// ─── POST /api/categories ───────────────────────────

describe("POST /api/categories", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/categories/route");
    POST = mod.POST;
  });

  const validBody = {
    nom: "Boissons",
    description: "Boissons fraîches",
    couleur: "#3b82f6",
  };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/categories", {
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
      new Request("http://localhost/api/categories", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/categories", {
        method: "POST",
        body: JSON.stringify({ nom: "A" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 if category name already exists", async () => {
    mockSession("ADMIN");
    (prisma.categorie.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategorie);

    const res = await POST(
      new Request("http://localhost/api/categories", {
        method: "POST",
        body: JSON.stringify({ nom: "Alimentaire" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("creates category for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.categorie.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.categorie.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCategorie,
      id: "cat-new",
      nom: validBody.nom,
    });

    const res = await POST(
      new Request("http://localhost/api/categories", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.nom).toBe("Boissons");
  });

  it("creates category for MANAGER", async () => {
    mockSession("MANAGER");
    (prisma.categorie.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.categorie.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategorie);

    const res = await POST(
      new Request("http://localhost/api/categories", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
  });
});

// ─── PUT /api/categories/[id] ───────────────────────

describe("PUT /api/categories/[id]", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/categories/[id]/route");
    PUT = mod.PUT;
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await PUT(
      new Request("http://localhost/api/categories/cat-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "cat-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if category not found", async () => {
    mockSession("ADMIN");
    (prisma.categorie.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost/api/categories/cat-999", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "cat-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates category for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.categorie.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategorie);
    (prisma.categorie.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.categorie.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCategorie,
      nom: "Épicerie",
    });

    const res = await PUT(
      new Request("http://localhost/api/categories/cat-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Épicerie" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "cat-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nom).toBe("Épicerie");
  });
});

// ─── DELETE /api/categories/[id] ────────────────────

describe("DELETE /api/categories/[id]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/categories/[id]/route");
    DELETE = mod.DELETE;
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await DELETE(
      new Request("http://localhost/api/categories/cat-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "cat-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 if category has products", async () => {
    mockSession("ADMIN");
    (prisma.categorie.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategorie);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const res = await DELETE(
      new Request("http://localhost/api/categories/cat-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "cat-1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("deletes category with no products", async () => {
    mockSession("ADMIN");
    (prisma.categorie.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategorie);
    (prisma.produit.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.categorie.delete as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategorie);

    const res = await DELETE(
      new Request("http://localhost/api/categories/cat-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "cat-1" }) }
    );
    expect(res.status).toBe(200);
  });
});
