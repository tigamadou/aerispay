/**
 * Lot B (C3) — Anti-survente sous concurrence sur POST /api/ventes.
 * Le contrôle de disponibilité + décrément doivent être atomiques (décrément
 * conditionnel : UPDATE ... WHERE stockActuel >= quantite). Si aucune ligne
 * n'est affectée, la vente est rejetée (422) — jamais de stock négatif.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
    vente: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    produit: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    mouvementStock: { create: vi.fn() },
    terminalCaisse: { findFirst: vi.fn() },
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
  lignes: [{ produitId: "p-1", quantite: 1, prixUnitaire: 1000, tva: 0, remise: 0 }],
  paiements: [{ mode: "ESPECES", montant: 1000 }],
  remise: 0,
};

const mockProduct = {
  id: "p-1", nom: "Dernier article", actif: true, stockActuel: 1,
  prixVente: new Decimal(1000), prixAchat: new Decimal(500),
};

const newVente = {
  id: "v-new", numero: "VTE-2026-00001", total: new Decimal(1000),
  sousTotal: new Decimal(1000), remise: new Decimal(0), tva: new Decimal(0),
  sessionId: "s-1",
  lignes: [{ id: "l1", produitId: "p-1", quantite: 1, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(1000), produit: { id: "p-1", nom: "Dernier article" } }],
  paiements: [{ mode: "ESPECES", montant: new Decimal(1000) }],
  caissier: { id: "user-1", nom: "T" },
};

describe("Lot B — anti-survente POST /api/ventes", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/route")).POST;
    (prisma.terminalCaisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE", terminalId: "caisse-1", terminal: { code: "P1" } });
  });

  function postSale() {
    return POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));
  }

  it("rejette la vente (422) quand le décrément conditionnel n'affecte aucune ligne", async () => {
    mockSession("CAISSIER");
    // Le produit semble disponible à la lecture (course : un autre tx a pris le dernier article),
    // mais le décrément conditionnel n'affecte aucune ligne.
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue(mockProduct),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        vente: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(newVente) },
        mouvementStock: { create: vi.fn() },
        sequence: { upsert: vi.fn().mockResolvedValue({ valeur: 1 }) },
      };
      return fn(tx);
    });

    const res = await postSale();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/insuffisant/i);
  });

  it("décrémente via updateMany conditionnel (stockActuel >= quantite), pas via update aveugle", async () => {
    mockSession("CAISSIER");
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txBlindUpdate = vi.fn();
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue({ ...mockProduct, stockActuel: 5 }),
          update: txBlindUpdate,
          updateMany: txUpdateMany,
        },
        vente: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(newVente) },
        mouvementStock: { create: vi.fn() },
        sequence: { upsert: vi.fn().mockResolvedValue({ valeur: 1 }) },
      };
      return fn(tx);
    });

    const res = await postSale();
    expect(res.status).toBe(201);
    expect(txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p-1", stockActuel: { gte: 1 } },
        data: { stockActuel: { decrement: 1 } },
      }),
    );
    // Pas de décrément aveugle (lecture puis update sans garde)
    expect(txBlindUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { stockActuel: { decrement: 1 } } }),
    );
  });
});
