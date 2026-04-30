import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    produit: { findMany: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "T", role },
  });
}

const mkProduct = (stock: number, min: number) => ({
  id: "p1", reference: "PRD-X", nom: "Test", stockActuel: stock, stockMinimum: min,
  actif: true, prixAchat: new Decimal(100), prixVente: new Decimal(200), tva: new Decimal(0),
  categorie: { id: "c1", nom: "Cat", couleur: "#000" },
});

describe("GET /api/stock/alertes", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/stock/alertes/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/stock/alertes"));
    expect(res.status).toBe(401);
  });

  it("returns products with low stock", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      mkProduct(3, 5),  // rupture
      mkProduct(8, 5),  // alerte (8 <= 10)
      mkProduct(20, 5), // normal (20 > 10) — should be filtered out
    ]);

    const res = await GET(new Request("http://localhost/api/stock/alertes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2); // rupture + alerte, not the normal one
  });

  it("returns empty array when all stock is normal", async () => {
    mockSession("CAISSIER");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      mkProduct(100, 5),
    ]);

    const res = await GET(new Request("http://localhost/api/stock/alertes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.produit.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await GET(new Request("http://localhost/api/stock/alertes"));
    expect(res.status).toBe(500);
  });
});
