/**
 * F1.2 — Numérotation par poste.
 * Le numéro de vente est préfixé par le code du poste : VTE-<codePoste>-YYYY-NNNNN.
 * La séquence est dédiée par poste (clé VTE-<codePoste>-<annee>), garantissant l'unicité
 * à l'échelle de l'organisation lors de l'agrégation cloud.
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

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

const mockProduct = { id: "p-1", nom: "T", actif: true, stockActuel: 10, prixVente: new Decimal(1000), prixAchat: new Decimal(500) };
const body = {
  sessionId: "s-1",
  lignes: [{ produitId: "p-1", quantite: 1, prixUnitaire: 1000, tva: 0, remise: 0 }],
  paiements: [{ mode: "ESPECES", montant: 1000 }],
  remise: 0,
};

function setupTx(cap: { numero?: string; seqKey?: string }) {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
    const tx = {
      produit: { findUnique: vi.fn().mockResolvedValue(mockProduct), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      vente: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: { numero: string } }) => {
          cap.numero = data.numero;
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
      sequence: {
        upsert: vi.fn().mockImplementation(async (args: { where: { id: string } }) => {
          cap.seqKey = args.where.id;
          return { valeur: 3 };
        }),
      },
    };
    return fn(tx);
  });
}

function post() {
  return POSTref(new Request("http://localhost/api/ventes", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

let POSTref: (req: Request) => Promise<Response>;

describe("F1.2 — numérotation préfixée par poste", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    POSTref = (await import("@/app/api/ventes/route")).POST;
  });

  it("préfixe le numéro avec le code du poste P2 → VTE-P2-YYYY-NNNNN", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", caisseId: "caisse-2", caisse: { code: "P2" },
    });
    const cap: { numero?: string; seqKey?: string } = {};
    setupTx(cap);

    const annee = new Date().getFullYear();
    const res = await post();
    expect(res.status).toBe(201);
    expect(cap.numero).toBe(`VTE-P2-${annee}-00003`);
    // La séquence est dédiée au poste
    expect(cap.seqKey).toBe(`VTE-P2-${annee}`);
  });

  it("deux postes distincts utilisent des séquences distinctes", async () => {
    const annee = new Date().getFullYear();

    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", caisseId: "caisse-1", caisse: { code: "P1" },
    });
    const capP1: { numero?: string; seqKey?: string } = {};
    setupTx(capP1);
    await post();
    expect(capP1.seqKey).toBe(`VTE-P1-${annee}`);

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", caisseId: "caisse-2", caisse: { code: "P2" },
    });
    const capP2: { numero?: string; seqKey?: string } = {};
    setupTx(capP2);
    await post();
    expect(capP2.seqKey).toBe(`VTE-P2-${annee}`);
  });
});
