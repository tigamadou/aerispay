/**
 * P0-001: Race condition on sale number generation.
 * Verifies that P2002 (unique constraint violation) is handled with retry.
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

const validSaleBody = {
  sessionId: "s-1",
  lignes: [{ produitId: "p-1", quantite: 1, prixUnitaire: 1000, tva: 0, remise: 0 }],
  paiements: [{ mode: "ESPECES", montant: 1000 }],
  remise: 0,
};

const mockProduct = {
  id: "p-1", nom: "Test", actif: true, stockActuel: 10,
  prixVente: new Decimal(1000), prixAchat: new Decimal(500),
};

describe("P0-001: P2002 race condition on sale number", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
  });

  it("retries on P2002 unique constraint violation and succeeds on second attempt", async () => {
    mockSession("CAISSIER");

    let attemptCount = 0;
    const newVente = {
      id: "v-new", numero: "VTE-2026-00002", total: new Decimal(1000),
      sousTotal: new Decimal(1000), remise: new Decimal(0), tva: new Decimal(0),
      sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p-1", quantite: 1, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(1000), produit: { id: "p-1", nom: "Test" } }],
      paiements: [{ mode: "ESPECES", montant: new Decimal(1000) }],
      caissier: { id: "user-1", nom: "T" },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      attemptCount++;
      if (attemptCount === 1) {
        // Simulate P2002 on first attempt
        const error = new Error("Unique constraint failed on the fields: (`numero`)");
        (error as Error & { code?: string }).code = "P2002";
        throw error;
      }
      // Second attempt succeeds
      const tx = {
        produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn() },
        vente: {
          findFirst: vi.fn().mockResolvedValue({ numero: "VTE-2026-00001" }),
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

    // Should succeed after retry, not 500
    expect(res.status).toBe(201);
    expect(attemptCount).toBe(2);
  });

  it("returns clear error after exhausting all P2002 retry attempts", async () => {
    mockSession("CAISSIER");

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      const error = new Error("Unique constraint failed on the fields: (`numero`)");
      (error as Error & { code?: string }).code = "P2002";
      throw error;
    });

    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSaleBody),
    }));

    // After max retries, should return an error (not 500 generic)
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/num[eé]ro/i);
  });
});
