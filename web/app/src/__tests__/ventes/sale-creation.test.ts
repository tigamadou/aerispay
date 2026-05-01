import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
    vente: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    produit: { findUnique: vi.fn(), update: vi.fn() },
    mouvementStock: { create: vi.fn() },
    caisse: { findFirst: vi.fn() },
    taxe: { findMany: vi.fn().mockResolvedValue([]) },
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
vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
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
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("returns 422 if session is not open", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "FERMEE" });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(422);
  });

  it("returns 422 if session not found", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(422);
  });

  it("creates sale successfully via transaction", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });

    const newVente = {
      id: "v-new", numero: "VTE-2026-00001", total: new Decimal(2000),
      sousTotal: new Decimal(2000), remise: new Decimal(0), tva: new Decimal(0),
      sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p-1", quantite: 2, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(2000), produit: { id: "p-1", nom: "Riz" } }],
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
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
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
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
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
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
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

  it("computes taxes from active config and stores taxesDetail", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });

    // Mock active taxes
    (prisma.taxe.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { nom: "TVA", taux: new Decimal(18), active: true, ordre: 0 },
      { nom: "AIB", taux: new Decimal(5), active: true, ordre: 1 },
    ]);

    let createData: Record<string, unknown> | null = null;

    const newVente = {
      id: "v-tax", numero: "VTE-2026-00002",
      total: new Decimal(2460), sousTotal: new Decimal(2000),
      remise: new Decimal(0), tva: new Decimal(460),
      taxesDetail: [{ nom: "TVA", taux: 18, montant: 360 }, { nom: "AIB", taux: 5, montant: 100 }],
      sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p-1", quantite: 2, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(2000), produit: { id: "p-1", nom: "Test" } }],
      paiements: [{ mode: "ESPECES", montant: new Decimal(3000) }],
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
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            createData = args.data;
            return newVente;
          }),
        },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validSaleBody, paiements: [{ mode: "ESPECES", montant: 3000 }] }),
    }));

    expect(res.status).toBe(201);
    expect(createData).not.toBeNull();
    const persisted = createData!;

    // Verify taxesDetail was passed to create
    const detail = persisted.taxesDetail as Array<{ nom: string; taux: number; montant: number }>;
    expect(detail).toHaveLength(2);
    expect(detail[0].nom).toBe("TVA");
    expect(detail[0].taux).toBe(18);
    expect(detail[0].montant).toBeCloseTo(360, 0);
    expect(detail[1].nom).toBe("AIB");
    expect(detail[1].taux).toBe(5);
    expect(detail[1].montant).toBeCloseTo(100, 0);

    // Total tva should be sum of all taxes
    const tvaTotal = persisted.tva;
    expect(Number(tvaTotal)).toBeCloseTo(460, 0);
  });

  it("creates sale without taxesDetail when no active taxes", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    (prisma.taxe.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    let createData: Record<string, unknown> | null = null;

    const newVente = {
      id: "v-notax", numero: "VTE-2026-00003",
      total: new Decimal(2000), sousTotal: new Decimal(2000),
      remise: new Decimal(0), tva: new Decimal(0),
      sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p-1", quantite: 2, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(2000), produit: { id: "p-1", nom: "Test" } }],
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
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            createData = args.data;
            return newVente;
          }),
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
    expect(createData).not.toBeNull();
    const persisted = createData!;

    // taxesDetail should be undefined (not stored) when no taxes
    expect(persisted.taxesDetail).toBeUndefined();

    // tva total should be 0
    expect(Number(persisted.tva)).toBe(0);
  });

  it("applies taxes on base after discount", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });

    (prisma.taxe.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { nom: "TVA", taux: new Decimal(10), active: true, ordre: 0 },
    ]);

    let createData: Record<string, unknown> | null = null;

    const newVente = {
      id: "v-disc", numero: "VTE-2026-00004",
      total: new Decimal(1980), sousTotal: new Decimal(2000),
      remise: new Decimal(200), tva: new Decimal(180),
      taxesDetail: [{ nom: "TVA", taux: 10, montant: 180 }],
      sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p-1", quantite: 2, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(2000), produit: { id: "p-1", nom: "Test" } }],
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
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            createData = args.data;
            return newVente;
          }),
        },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    // sous-total = 2000, remise = 200, base = 1800, TVA 10% = 180
    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validSaleBody, remise: 200, paiements: [{ mode: "ESPECES", montant: 2000 }] }),
    }));

    expect(res.status).toBe(201);
    expect(createData).not.toBeNull();
    const persisted = createData!;

    const detail = persisted.taxesDetail as Array<{ nom: string; taux: number; montant: number }>;
    expect(detail).toHaveLength(1);
    expect(detail[0].nom).toBe("TVA");
    // base = 2000 - 200 = 1800, 10% of 1800 = 180
    expect(detail[0].montant).toBeCloseTo(180, 0);
  });

  it("returns 500 on unexpected error", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("unexpected"));

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
    expect(res.status).toBe(500);
  });
});
