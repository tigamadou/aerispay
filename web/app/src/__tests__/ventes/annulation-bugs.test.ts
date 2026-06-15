/**
 * P0-002: Refund exceeds sale total (overpayment).
 * P0-003: Cancellation possible on closed/validated session.
 * P0-005: Missing caisseId check in annulation route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { findUnique: vi.fn(), update: vi.fn() },
    produit: { update: vi.fn() },
    mouvementStock: { create: vi.fn() },
    caisse: { findFirst: vi.fn() },
    comptoirSession: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SALE_CANCELLED: "SALE_CANCELLED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));
vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { createMovementInTx } from "@/lib/services/cash-movement";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

const ctx = { params: Promise.resolve({ id: "vente-1" }) };

function makeReq() {
  return new Request("http://localhost/api/ventes/vente-1/annuler", { method: "POST" });
}

// ─── P0-002: Refund capped to sale total ──────────────────

describe("P0-002: Refund must not exceed sale total", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/[id]/annuler/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("caps refund to sale total when payment exceeds it (overpayment)", async () => {
    mockSession("ADMIN");

    const venteOverpaid = {
      id: "vente-1",
      numero: "VTE-2026-00001",
      dateVente: new Date(),
      sousTotal: 5000,
      remise: 0,
      tva: 0,
      total: 5000,
      statut: "VALIDEE",
      sessionId: "session-1",
      userId: "user-1",
      lignes: [
        { id: "l-1", quantite: 1, prixUnitaire: 5000, remise: 0, tva: 0, sousTotal: 5000, produitId: "p-1", produit: { id: "p-1", nom: "Test", stockActuel: 10 } },
      ],
      paiements: [
        { id: "pay-1", mode: "ESPECES", montant: 5100, reference: null, venteId: "vente-1" },
      ],
    };

    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOverpaid);
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "session-1", statut: "OUVERTE", userId: "user-1",
    });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        vente: {
          update: vi.fn().mockResolvedValue({
            ...venteOverpaid,
            statut: "ANNULEE",
            lignes: venteOverpaid.lignes.map(l => ({
              ...l, produit: { id: l.produitId, nom: "Test", stockActuel: 10 },
            })),
            paiements: venteOverpaid.paiements,
            caissier: { id: "user-1", nom: "T" },
          }),
        },
        produit: { update: vi.fn() },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(200);

    // The refund movement should be capped to 5000 (sale total), not 5100 (payment amount)
    expect(createMovementInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        montant: -5000,
        type: "REMBOURSEMENT",
      }),
    );
  });
});

// ─── P0-003: Cancellation blocked on closed session ────────

describe("P0-003: Cancellation blocked on closed/validated session", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/[id]/annuler/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("returns 422 when session is VALIDEE", async () => {
    mockSession("ADMIN");

    const vente = {
      id: "vente-1",
      numero: "VTE-2026-00001",
      dateVente: new Date(),
      total: 5000,
      statut: "VALIDEE",
      sessionId: "session-1",
      userId: "user-1",
      lignes: [],
      paiements: [],
    };

    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(vente);
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "session-1", statut: "VALIDEE", userId: "user-1",
    });

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/session.*ferm[eé]/i);
  });

  it("returns 422 when session is FERMEE", async () => {
    mockSession("ADMIN");

    const vente = {
      id: "vente-1",
      numero: "VTE-2026-00001",
      dateVente: new Date(),
      total: 5000,
      statut: "VALIDEE",
      sessionId: "session-1",
      userId: "user-1",
      lignes: [],
      paiements: [],
    };

    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(vente);
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "session-1", statut: "FERMEE", userId: "user-1",
    });

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/session.*ferm[eé]/i);
  });

  it("allows cancellation when session is OUVERTE", async () => {
    mockSession("ADMIN");

    const vente = {
      id: "vente-1",
      numero: "VTE-2026-00001",
      dateVente: new Date(),
      total: 5000,
      statut: "VALIDEE",
      sessionId: "session-1",
      userId: "user-1",
      lignes: [{ id: "l-1", quantite: 1, prixUnitaire: 5000, remise: 0, tva: 0, sousTotal: 5000, produitId: "p-1" }],
      paiements: [{ id: "pay-1", mode: "ESPECES", montant: 5000, reference: null, venteId: "vente-1" }],
    };

    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(vente);
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "session-1", statut: "OUVERTE", userId: "user-1",
    });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        vente: {
          update: vi.fn().mockResolvedValue({
            ...vente,
            statut: "ANNULEE",
            lignes: vente.lignes.map(l => ({
              ...l, produit: { id: l.produitId, nom: "Test", stockActuel: 10 },
            })),
            paiements: vente.paiements,
            caissier: { id: "user-1", nom: "T" },
          }),
        },
        produit: { update: vi.fn() },
        mouvementStock: { create: vi.fn() },
      };
      return fn(tx);
    });

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(200);
  });
});

// ─── P0-005: Missing caisseId check in annulation ─────────

describe("P0-005: caisseId validation on annulation", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/ventes/[id]/annuler/route")).POST;
  });

  it("returns 422 when no active caisse exists", async () => {
    mockSession("ADMIN");

    const vente = {
      id: "vente-1",
      numero: "VTE-2026-00001",
      dateVente: new Date(),
      total: 5000,
      statut: "VALIDEE",
      sessionId: "session-1",
      userId: "user-1",
      lignes: [],
      paiements: [],
    };

    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(vente);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/caisse/i);
  });
});
