import type { Prisma, ModePaiement, TypeMouvementCaisse } from "@prisma/client";
import { prisma } from "@/lib/db";

// ─── Types ──────────────────────────────────────────

interface CreateMovementParams {
  type: TypeMouvementCaisse;
  mode: ModePaiement;
  montant: number;
  sessionId: string;
  auteurId: string;
  venteId?: string;
  motif?: string;
  reference?: string;
  justificatif?: string;
  offline?: boolean;
}

interface SoldeTheoriqueParMode {
  mode: ModePaiement;
  solde: number;
}

// ─── Service ────────────────────────────────────────

/**
 * Create a cash movement within an existing Prisma transaction.
 * Use this when the movement must be atomic with other operations (e.g. sale creation).
 */
export async function createMovementInTx(
  tx: Prisma.TransactionClient,
  params: CreateMovementParams,
) {
  return tx.mouvementCaisse.create({
    data: {
      type: params.type,
      mode: params.mode,
      montant: params.montant,
      sessionId: params.sessionId,
      auteurId: params.auteurId,
      venteId: params.venteId ?? null,
      motif: params.motif ?? null,
      reference: params.reference ?? null,
      justificatif: params.justificatif ?? null,
      offline: params.offline ?? false,
    },
  });
}

/**
 * Create a cash movement outside of a transaction (standalone).
 */
export async function createMovement(params: CreateMovementParams) {
  return prisma.mouvementCaisse.create({
    data: {
      type: params.type,
      mode: params.mode,
      montant: params.montant,
      sessionId: params.sessionId,
      auteurId: params.auteurId,
      venteId: params.venteId ?? null,
      motif: params.motif ?? null,
      reference: params.reference ?? null,
      justificatif: params.justificatif ?? null,
      offline: params.offline ?? false,
    },
  });
}

/**
 * Compute theoretical balance per payment mode for a session,
 * by summing all cash movements algebraically.
 *
 * Positive movements (FOND_INITIAL, VENTE, APPORT) add to the balance.
 * Negative movements (REMBOURSEMENT, RETRAIT, DEPENSE) subtract from the balance.
 * CORRECTION can be positive or negative.
 */
export async function computeSoldeTheoriqueParMode(
  sessionId: string,
): Promise<SoldeTheoriqueParMode[]> {
  const mouvements = await prisma.mouvementCaisse.findMany({
    where: { sessionId },
    select: { mode: true, montant: true },
  });

  const soldes = new Map<ModePaiement, number>();

  for (const m of mouvements) {
    const current = soldes.get(m.mode) ?? 0;
    soldes.set(m.mode, current + Number(m.montant));
  }

  return Array.from(soldes.entries()).map(([mode, solde]) => ({
    mode,
    solde,
  }));
}

/**
 * Compute theoretical balance for legacy cash/mobile money fields.
 * Returns the same shape as the old computeSoldeTheorique for backward compat.
 */
export async function computeSoldeTheoriqueLegacy(
  sessionId: string,
): Promise<{ cash: number; mobileMoney: number }> {
  const soldes = await computeSoldeTheoriqueParMode(sessionId);

  let cash = 0;
  let mobileMoney = 0;

  for (const s of soldes) {
    if (s.mode === "ESPECES") {
      cash = s.solde;
    } else {
      // All non-cash modes contribute to mobileMoney for legacy compat
      mobileMoney += s.solde;
    }
  }

  return { cash, mobileMoney };
}

/**
 * List all movements for a session, ordered by creation time.
 */
export async function listMovements(sessionId: string) {
  return prisma.mouvementCaisse.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: {
      auteur: { select: { id: true, nom: true } },
      vente: { select: { id: true, numero: true } },
    },
  });
}
