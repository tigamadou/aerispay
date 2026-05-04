/**
 * P1-001: Remise vente sans borne superieure — total must remain positive.
 */
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

const mockProduct = {
  id: "p-1", nom: "Test", actif: true, stockActuel: 10,
  prixVente: new Decimal(1000), prixAchat: new Decimal(500),
};

describe("P1-001: Sale total must be positive", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
  });

  it("returns 422 when remise exceeds sous-total (total negative)", async () => {
    mockSession("CAISSIER");

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn() },
        vente: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "s-1",
        lignes: [{ produitId: "p-1", quantite: 1, prixUnitaire: 5000, tva: 0, remise: 0 }],
        paiements: [{ mode: "ESPECES", montant: 100 }],
        remise: 999999,
      }),
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/total.*positif/i);
  });

  it("allows remise that keeps total positive", async () => {
    mockSession("CAISSIER");

    const newVente = {
      id: "v-ok", numero: "VTE-2026-00001", total: new Decimal(4000),
      sousTotal: new Decimal(5000), remise: new Decimal(1000), tva: new Decimal(0),
      sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p-1", quantite: 1, prixUnitaire: new Decimal(5000), sousTotal: new Decimal(5000), produit: { id: "p-1", nom: "Test" } }],
      paiements: [{ mode: "ESPECES", montant: new Decimal(4000) }],
      caissier: { id: "user-1", nom: "T" },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn() },
        vente: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(newVente) },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "s-1",
        lignes: [{ produitId: "p-1", quantite: 1, prixUnitaire: 5000, tva: 0, remise: 0 }],
        paiements: [{ mode: "ESPECES", montant: 4000 }],
        remise: 1000,
      }),
    }));

    expect(res.status).toBe(201);
  });
});
