/**
 * Lot F — Décimaux de bout en bout.
 * Le sous-total de ligne (prix × quantité × (1 - remise/100)) doit être calculé en
 * Prisma.Decimal, sans arithmétique `number` intermédiaire qui introduit des erreurs
 * de flottant (ex. 100 × 3 × (1 - 0.33) = 201.00000000000003 en number).
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
    sequence: { upsert: vi.fn() },
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
vi.mock("@/lib/services/cash-movement", () => ({ createMovementInTx: vi.fn() }));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

const mockProduct = { id: "p-1", nom: "T", actif: true, stockActuel: 10, prixVente: new Decimal(100), prixAchat: new Decimal(50) };

describe("Lot F — précision décimale du sous-total de ligne", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/route")).POST;
    (prisma.terminalCaisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE", terminalId: "caisse-1", terminal: { code: "P1" } });
  });

  it("calcule un sous-total de ligne exact (pas d'artefact de flottant)", async () => {
    mockSession("CAISSIER");
    let createData: { lignes: { create: Array<{ sousTotal: unknown }> } } | null = null;

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        vente: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }: { data: typeof createData }) => {
            createData = data;
            return {
              id: "v", numero: "VTE-2026-00001", total: new Decimal(201), sousTotal: new Decimal(201),
              remise: new Decimal(0), tva: new Decimal(0), sessionId: "s-1",
              lignes: [{ id: "l", produitId: "p-1", quantite: 3, prixUnitaire: new Decimal(100), sousTotal: new Decimal(201), produit: { nom: "T" } }],
              paiements: [{ mode: "ESPECES", montant: new Decimal(201) }],
              caissier: { id: "user-1", nom: "T" },
            };
          }),
        },
        mouvementStock: { create: vi.fn() },
        sequence: { upsert: vi.fn().mockResolvedValue({ valeur: 1 }) },
      };
      return fn(tx);
    });

    // 100 × 3 × (1 - 33/100) = 201 (exact) ; en number => 201.00000000000003
    const res = await POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "s-1",
        lignes: [{ produitId: "p-1", quantite: 3, prixUnitaire: 100, tva: 0, remise: 33 }],
        paiements: [{ mode: "ESPECES", montant: 201 }],
        remise: 0,
      }),
    }));

    expect(res.status).toBe(201);
    expect(createData).not.toBeNull();
    const ligneSousTotal = createData!.lignes.create[0].sousTotal;
    // Doit être exactement 201 (Decimal), sans artefact .00000000000003
    expect(Number(ligneSousTotal)).toBe(201);
    expect(String(ligneSousTotal)).toBe("201");
  });
});
