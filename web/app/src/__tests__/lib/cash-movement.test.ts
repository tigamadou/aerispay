import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    mouvementCaisse: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  createMovementInTx,
  createMovement,
  computeSoldeCaisseParMode,
  computeSoldeTheoriqueParMode,
  computeSoldeTheoriqueLegacy,
  listMovements,
  listCaisseMovements,
} from "@/lib/services/cash-movement";

// ─── Helpers ────────────────────────────────────────

const baseParams = {
  type: "APPORT" as const,
  mode: "ESPECES" as const,
  montant: 5000,
  caisseId: "c-1",
  auteurId: "u-1",
};

// ─── Tests ──────────────────────────────────────────

describe("cash-movement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createMovementInTx", () => {
    it("appelle tx.mouvementCaisse.create avec les bonnes données", async () => {
      const txMock = { mouvementCaisse: { create: vi.fn().mockResolvedValue({ id: "m-1" }) } };
      await createMovementInTx(txMock as never, baseParams);

      expect(txMock.mouvementCaisse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "APPORT",
          mode: "ESPECES",
          montant: 5000,
          caisseId: "c-1",
          auteurId: "u-1",
          sessionId: null,
          venteId: null,
          motif: null,
          reference: null,
          justificatif: null,
          offline: false,
        }),
      });
    });
  });

  describe("createMovement", () => {
    it("appelle prisma.mouvementCaisse.create avec les bonnes données", async () => {
      (prisma.mouvementCaisse.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "m-2" });
      const result = await createMovement(baseParams);

      expect(prisma.mouvementCaisse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "APPORT",
          mode: "ESPECES",
          montant: 5000,
          offline: false,
        }),
      });
      expect(result).toEqual({ id: "m-2" });
    });

    it("met les valeurs par défaut pour les champs optionnels", async () => {
      (prisma.mouvementCaisse.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "m-3" });
      await createMovement(baseParams);

      expect(prisma.mouvementCaisse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: null,
          venteId: null,
          motif: null,
          reference: null,
          justificatif: null,
          offline: false,
        }),
      });
    });

    it("utilise les valeurs fournies pour les champs optionnels", async () => {
      (prisma.mouvementCaisse.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "m-4" });
      await createMovement({
        ...baseParams,
        sessionId: "s-1",
        venteId: "v-1",
        motif: "Test",
        reference: "REF-1",
        justificatif: "doc.pdf",
        offline: true,
      });

      expect(prisma.mouvementCaisse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: "s-1",
          venteId: "v-1",
          motif: "Test",
          reference: "REF-1",
          justificatif: "doc.pdf",
          offline: true,
        }),
      });
    });
  });

  describe("computeSoldeCaisseParMode", () => {
    it("groupe par mode et somme les montants", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { mode: "ESPECES", montant: 5000 },
        { mode: "ESPECES", montant: 3000 },
        { mode: "MOBILE_MONEY", montant: 2000 },
      ]);

      const result = await computeSoldeCaisseParMode("c-1");
      expect(result).toEqual(
        expect.arrayContaining([
          { mode: "ESPECES", solde: 8000 },
          { mode: "MOBILE_MONEY", solde: 2000 },
        ]),
      );
    });

    it("renvoie un tableau vide sans mouvements", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await computeSoldeCaisseParMode("c-1");
      expect(result).toEqual([]);
    });
  });

  describe("computeSoldeTheoriqueParMode", () => {
    it("groupe et somme correctement par mode", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { mode: "ESPECES", montant: 10000 },
        { mode: "ESPECES", montant: -2000 },
        { mode: "MOBILE_MONEY", montant: 5000 },
      ]);

      const result = await computeSoldeTheoriqueParMode("s-1");
      expect(result).toEqual(
        expect.arrayContaining([
          { mode: "ESPECES", solde: 8000 },
          { mode: "MOBILE_MONEY", solde: 5000 },
        ]),
      );
    });
  });

  describe("computeSoldeTheoriqueLegacy", () => {
    it("renvoie cash pour ESPECES et mobileMoney pour les autres", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { mode: "ESPECES", montant: 10000 },
        { mode: "MOBILE_MONEY", montant: 3000 },
        { mode: "WAVE", montant: 2000 },
      ]);

      const result = await computeSoldeTheoriqueLegacy("s-1");
      expect(result.cash).toBe(10000);
      expect(result.mobileMoney).toBe(5000);
    });

    it("renvoie des zéros sans mouvements", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await computeSoldeTheoriqueLegacy("s-1");
      expect(result).toEqual({ cash: 0, mobileMoney: 0 });
    });
  });

  describe("listMovements", () => {
    it("appelle findMany avec le bon filtre session et ordre", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await listMovements("s-1");

      expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith({
        where: { sessionId: "s-1" },
        orderBy: { createdAt: "asc" },
        include: {
          auteur: { select: { id: true, nom: true } },
          vente: { select: { id: true, numero: true } },
        },
      });
    });
  });

  describe("listCaisseMovements", () => {
    it("appelle findMany avec le bon filtre caisse et ordre desc", async () => {
      (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await listCaisseMovements("c-1");

      expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith({
        where: { caisseId: "c-1" },
        orderBy: { createdAt: "desc" },
        include: {
          auteur: { select: { id: true, nom: true } },
          vente: { select: { id: true, numero: true } },
        },
      });
    });
  });
});
