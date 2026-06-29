/**
 * Lot B (C3) — Atomicité des mouvements de stock manuels.
 * SORTIE/PERTE : décrément conditionnel (UPDATE ... WHERE stockActuel >= quantite).
 * AJUSTEMENT : verrou de ligne (SELECT ... FOR UPDATE) avant écriture pour éviter
 * le lost update entre deux ajustements concurrents.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    mouvementStock: { findMany: vi.fn(), count: vi.fn() },
    produit: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { STOCK_MOVEMENT_CREATED: "STOCK_MOVEMENT_CREATED" },
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

const mockProduit = {
  id: "prod-1", reference: "PRD-ABC12", nom: "Riz 5kg",
  stockActuel: 50, stockMinimum: 5, actif: true,
  prixAchat: new Decimal(3000), prixVente: new Decimal(4500),
};

const createdMvt = {
  id: "mvt-x", type: "SORTIE", quantite: 2, quantiteAvant: 50, quantiteApres: 48,
  produit: { id: "prod-1", nom: "Riz 5kg", reference: "PRD-ABC12" },
};

describe("Lot B — atomicité POST /api/stock/mouvements", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/stock/mouvements/route")).POST;
  });

  function postMvt(body: Record<string, unknown>) {
    return POST(new Request("http://localhost/api/stock/mouvements", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  }

  it("SORTIE : rejette (422) si le décrément conditionnel n'affecte aucune ligne", async () => {
    mockSession("ADMIN");
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          // Lecture : stock suffisant en apparence (course), mais garde atomique échoue
          findUnique: vi.fn().mockResolvedValue({ ...mockProduit, stockActuel: 5 }),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        mouvementStock: { create: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([{ stockActuel: 5 }]),
      };
      return fn(tx);
    });

    const res = await postMvt({ produitId: "prod-1", type: "SORTIE", quantite: 3 });
    expect(res.status).toBe(422);
  });

  it("SORTIE : décrémente via updateMany conditionnel (stockActuel >= quantite)", async () => {
    mockSession("ADMIN");
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue(mockProduit),
          update: vi.fn(),
          updateMany: txUpdateMany,
        },
        mouvementStock: { create: vi.fn().mockResolvedValue(createdMvt) },
        $queryRaw: vi.fn().mockResolvedValue([{ stockActuel: 50 }]),
      };
      return fn(tx);
    });

    const res = await postMvt({ produitId: "prod-1", type: "SORTIE", quantite: 2 });
    expect(res.status).toBe(201);
    expect(txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prod-1", stockActuel: { gte: 2 } },
        data: { stockActuel: { decrement: 2 } },
      }),
    );
  });

  it("AJUSTEMENT : verrouille la ligne (SELECT ... FOR UPDATE) avant écriture", async () => {
    mockSession("ADMIN");
    const txQueryRaw = vi.fn().mockResolvedValue([{ stockActuel: 50 }]);
    const txUpdate = vi.fn();
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: {
          findUnique: vi.fn().mockResolvedValue(mockProduit),
          update: txUpdate,
          updateMany: vi.fn(),
        },
        mouvementStock: { create: vi.fn().mockResolvedValue({ ...createdMvt, type: "AJUSTEMENT", quantite: 25, quantiteApres: 25 }) },
        $queryRaw: txQueryRaw,
      };
      return fn(tx);
    });

    const res = await postMvt({ produitId: "prod-1", type: "AJUSTEMENT", quantite: 25, motif: "Inventaire correction" });
    expect(res.status).toBe(201);
    // Un verrou de ligne doit être posé avant l'écriture
    expect(txQueryRaw).toHaveBeenCalled();
    const rawArg = txQueryRaw.mock.calls[0]?.[0];
    const rawStr = Array.isArray(rawArg) ? rawArg.join("?") : String(rawArg);
    expect(rawStr.toUpperCase()).toContain("FOR UPDATE");
  });
});
