/**
 * Lot G — RULE-FOND-003 (Modèle 2).
 * La levée crée, par mode, un mouvement LEVEE négatif ramenant le solde de session
 * au float. Après la levée : soldeSession(mode) == float. La levée est tracée.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { leverRecettesInTx } from "@/lib/services/cash-movement";

function makeTx(mouvements: Array<{ mode: string; montant: number }>) {
  const create = vi.fn().mockResolvedValue({});
  const tx = {
    mouvementCaisse: {
      findMany: vi.fn().mockResolvedValue(mouvements),
      create,
    },
  };
  return { tx, create };
}

describe("Lot G — leverRecettesInTx", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ramène chaque mode au float et trace une LEVEE négative", async () => {
    // Session : 50000 ESPECES (float 20000 -> à lever 30000), 8000 MTN (float 0 -> 8000)
    const { tx, create } = makeTx([
      { mode: "ESPECES", montant: 20000 },
      { mode: "ESPECES", montant: 30000 },
      { mode: "MOBILE_MONEY_MTN", montant: 8000 },
    ]);

    const levees = await leverRecettesInTx(tx as never, {
      sessionId: "s-1",
      terminalId: "caisse-1",
      auteurId: "user-1",
      floatParMode: { ESPECES: 20000 },
      justificatif: "Levée coffre",
    });

    // LEVEE ESPECES = -(50000 - 20000) = -30000
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "LEVEE", mode: "ESPECES", montant: -30000, sessionId: "s-1", terminalId: "caisse-1" }),
    });
    // LEVEE MTN = -(8000 - 0) = -8000
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "LEVEE", mode: "MOBILE_MONEY_MTN", montant: -8000 }),
    });

    // Solde reporté == float : 50000 + (-30000) = 20000 (float)
    const especes = levees.find((l) => l.mode === "ESPECES");
    expect(especes?.montant).toBe(-30000);
  });

  it("ne lève rien si le solde est déjà au float", async () => {
    const { tx, create } = makeTx([{ mode: "ESPECES", montant: 20000 }]);
    const levees = await leverRecettesInTx(tx as never, {
      sessionId: "s-1", terminalId: "c-1", auteurId: "u-1", floatParMode: { ESPECES: 20000 },
    });
    expect(levees).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });
});
