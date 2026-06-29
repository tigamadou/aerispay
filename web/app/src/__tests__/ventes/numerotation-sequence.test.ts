/**
 * Lot E — M3 (RULE-NUM-001).
 * Le numéro de vente provient d'un compteur transactionnel dédié (table Sequence),
 * incrémenté atomiquement : unique, monotone, sans plafond annuel (pas de 99 999).
 * Format documenté : VTE-YYYY-NNNNN (NNNNN = compteur, padStart 5 minimum).
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
    caisse: { findFirst: vi.fn() },
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

const mockProduct = { id: "p-1", nom: "T", actif: true, stockActuel: 10, prixVente: new Decimal(1000), prixAchat: new Decimal(500) };
const body = {
  sessionId: "s-1",
  lignes: [{ produitId: "p-1", quantite: 1, prixUnitaire: 1000, tva: 0, remise: 0 }],
  paiements: [{ mode: "ESPECES", montant: 1000 }],
  remise: 0,
};

function setupTx(seqValeur: number, capture: { numero?: string }) {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
    const tx = {
      produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      vente: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: { numero: string } }) => {
          capture.numero = data.numero;
          return {
            id: "v", numero: data.numero, total: new Decimal(1000), sousTotal: new Decimal(1000),
            remise: new Decimal(0), tva: new Decimal(0), sessionId: "s-1",
            lignes: [{ id: "l", produitId: "p-1", quantite: 1, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(1000), produit: { nom: "T" } }],
            paiements: [{ mode: "ESPECES", montant: new Decimal(1000) }],
            caissier: { id: "user-1", nom: "T" },
          };
        }),
      },
      mouvementStock: { create: vi.fn() },
      sequence: { upsert: vi.fn().mockResolvedValue({ id: "VTE-2026", valeur: seqValeur }) },
    };
    return fn(tx);
  });
}

describe("Lot E — numérotation via compteur Sequence", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE", caisseId: "caisse-1", caisse: { code: "P1" } });
  });

  function post() {
    return POST(new Request("http://localhost/api/ventes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
  }

  it("utilise le compteur Sequence (upsert increment) pour le numéro", async () => {
    mockSession("CAISSIER");
    const cap: { numero?: string } = {};
    let upsertArgs: Record<string, unknown> | undefined;
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        vente: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }: { data: { numero: string } }) => {
          cap.numero = data.numero;
          return { id: "v", numero: data.numero, total: new Decimal(1000), sousTotal: new Decimal(1000), remise: new Decimal(0), tva: new Decimal(0), sessionId: "s-1", lignes: [{ id: "l", produitId: "p-1", quantite: 1, prixUnitaire: new Decimal(1000), sousTotal: new Decimal(1000), produit: { nom: "T" } }], paiements: [{ mode: "ESPECES", montant: new Decimal(1000) }], caissier: { id: "user-1", nom: "T" } };
        }) },
        mouvementStock: { create: vi.fn() },
        sequence: { upsert: vi.fn().mockImplementation(async (args: Record<string, unknown>) => { upsertArgs = args; return { valeur: 7 }; }) },
      };
      return fn(tx);
    });

    const res = await post();
    expect(res.status).toBe(201);
    expect(upsertArgs).toBeDefined();
    expect((upsertArgs as { update: { valeur: { increment: number } } }).update).toEqual({ valeur: { increment: 1 } });
    expect(cap.numero).toBe("VTE-P1-2026-00007");
  });

  it("ne plafonne pas à 99 999 (au-delà, plus de 5 chiffres)", async () => {
    mockSession("CAISSIER");
    const cap: { numero?: string } = {};
    setupTx(100000, cap);
    const res = await post();
    expect(res.status).toBe(201);
    expect(cap.numero).toBe("VTE-P1-2026-100000");
  });
});
