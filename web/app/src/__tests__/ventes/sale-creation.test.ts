import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    caisseSession: { findUnique: vi.fn() },
    vente: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    produit: { findUnique: vi.fn(), update: vi.fn() },
    mouvementStock: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SALE_COMPLETED: "SALE_COMPLETED" },
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

const validSaleBody = {
  sessionId: "s-1",
  lignes: [{ produitId: "p-1", quantite: 2, prixUnitaire: 1000, tva: 0, remise: 0 }],
  paiements: [{ mode: "ESPECES", montant: 2000 }],
  remise: 0,
};

const mockProduct = {
  id: "p-1", nom: "Test", actif: true, stockActuel: 10,
  prixVente: new Decimal(1000), prixAchat: new Decimal(500),
};

describe("POST /api/ventes (sale creation)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/route")).POST;
  });

  it("returns 422 if session is not open", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "FERMEE" });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(422);
  });

  it("returns 422 if session not found", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(422);
  });

  it("creates sale successfully via transaction", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });

    const newVente = {
      id: "v-new", numero: "VTE-2026-00001", total: new Decimal(2000),
      sousTotal: new Decimal(2000), remise: new Decimal(0), tva: new Decimal(0),
      lignes: [{ id: "l1", produitId: "p-1", quantite: 2 }],
      paiements: [{ mode: "ESPECES", montant: new Decimal(2000) }],
      caissier: { id: "user-1", nom: "T" },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue(mockProduct),
          update: vi.fn(),
        },
        vente: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(newVente),
        },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(201);
  });

  it("returns 422 on stock insuffisant", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue({ ...mockProduct, stockActuel: 1 }),
          update: vi.fn(),
        },
        vente: { findFirst: vi.fn(), create: vi.fn() },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(422);
  });

  it("returns 422 on produit inactif", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue({ ...mockProduct, actif: false }),
          update: vi.fn(),
        },
        vente: { findFirst: vi.fn(), create: vi.fn() },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(422);
  });

  it("returns 422 on paiement insuffisant", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn() },
        vente: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({
          id: "v", numero: "VTE-2026-00001", total: new Decimal(2000),
          sousTotal: new Decimal(2000), remise: new Decimal(0), tva: new Decimal(0),
          lignes: [], paiements: [], caissier: { id: "user-1", nom: "T" },
        }) },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validSaleBody, paiements: [{ mode: "ESPECES", montant: 100 }] }),
    }));
    expect(res.status).toBe(422);
  });

  it("returns 500 on unexpected error", async () => {
    mockSession("CAISSIER");
    (prisma.caisseSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("unexpected"));

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(500);
  });
});
