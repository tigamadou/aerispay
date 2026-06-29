/**
 * Lot A (C2) — Solde théorique unifié.
 * computeSoldeSession est l'unique source du théorique d'une session :
 * Σ algébrique des MouvementCaisse de la session, FOND_OUVERTURE (Lot G) inclus
 * exactement une fois.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    mouvementCaisse: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { computeSoldeSession } from "@/lib/services/cash-movement";

describe("Lot A — computeSoldeSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inclut le FOND_OUVERTURE et somme les mouvements de la session", async () => {
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", montant: 20000 }, // FOND_OUVERTURE
      { mode: "ESPECES", montant: 5000 }, // VENTE
      { mode: "MOBILE_MONEY_MTN", montant: 3000 }, // VENTE
    ]);

    const soldes = await computeSoldeSession("s-1");

    const especes = soldes.find((s) => s.mode === "ESPECES");
    const mm = soldes.find((s) => s.mode === "MOBILE_MONEY_MTN");
    expect(especes?.solde).toBe(25000); // fond + recettes, compté une seule fois
    expect(mm?.solde).toBe(3000);
  });

  it("ne lit que les mouvements de la session (scope sessionId)", async () => {
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await computeSoldeSession("s-42");
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: "s-42" } }),
    );
  });
});
