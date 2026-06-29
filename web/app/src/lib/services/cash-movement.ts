import type { Prisma, TypeMouvementCaisse } from "@prisma/client";
import { prisma } from "@/lib/db";

// ─── Types ──────────────────────────────────────────

interface CreateMovementParams {
  type: TypeMouvementCaisse;
  mode: string;
  montant: number;
  caisseId: string;
  auteurId: string;
  sessionId?: string;
  venteId?: string;
  motif?: string;
  reference?: string;
  justificatif?: string;
  offline?: boolean;
}

interface SoldeTheoriqueParMode {
  mode: string;
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
      caisseId: params.caisseId,
      sessionId: params.sessionId ?? null,
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
      caisseId: params.caisseId,
      sessionId: params.sessionId ?? null,
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
 * Solde physique d'une caisse (grand livre), par mode = somme de TOUS les mouvements.
 *
 * ⚠️ Lot A (RULE-SOLDE-001) : réservé au solde caisse physique (monitoring, garde
 * de retrait). NE PAS l'utiliser pour le théorique d'une session — utiliser
 * `computeSoldeSession`, qui est scopé à la session et inclut le FOND_OUVERTURE.
 */
export async function computeSoldeCaisseParMode(
  caisseId: string,
): Promise<SoldeTheoriqueParMode[]> {
  const result = await prisma.mouvementCaisse.groupBy({
    by: ["mode"],
    where: { caisseId },
    _sum: { montant: true },
  });

  return result.map((r) => ({
    mode: r.mode,
    solde: Number(r._sum.montant ?? 0),
  }));
}

/**
 * Compute theoretical balance per payment mode for a session period,
 * by summing movements linked to that session.
 */
export async function computeSoldeTheoriqueParMode(
  sessionId: string,
): Promise<SoldeTheoriqueParMode[]> {
  const mouvements = await prisma.mouvementCaisse.findMany({
    where: { sessionId },
    select: { mode: true, montant: true },
  });

  const soldes = new Map<string, number>();

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
 * Lot A (RULE-SOLDE-001/002) — Source UNIQUE du solde théorique d'une session,
 * consommée par `closure`, `validate` et l'intégrité.
 *
 *   soldeTheoriqueSession(mode) = Σ MouvementCaisse(session, mode)
 *
 * Le fond d'ouverture (Lot G, type FOND_OUVERTURE) étant un mouvement rattaché à la
 * session, il est inclus nativement et exactement une fois. La levée (LEVEE) y est
 * également incluse algébriquement.
 */
export async function computeSoldeSession(
  sessionId: string,
): Promise<SoldeTheoriqueParMode[]> {
  return computeSoldeTheoriqueParMode(sessionId);
}

/**
 * Lot G (Modèle 2, RULE-FOND-003) — Levée des recettes vers le coffre à la clôture.
 * Crée, par mode, un mouvement LEVEE négatif ramenant le solde de session au float.
 * Après la levée : soldeSession(mode) == float(mode). La levée est tracée (auteur,
 * justificatif). À appeler dans la transaction de finalisation.
 */
export async function leverRecettesInTx(
  tx: Prisma.TransactionClient,
  params: {
    sessionId: string;
    caisseId: string;
    auteurId: string;
    floatParMode: Record<string, number>;
    justificatif?: string;
  },
): Promise<Array<{ mode: string; montant: number }>> {
  const soldes = await computeSoldeSessionInTx(tx, params.sessionId);
  const levees: Array<{ mode: string; montant: number }> = [];

  for (const { mode, solde } of soldes) {
    const floatMode = params.floatParMode[mode] ?? 0;
    const aLever = solde - floatMode; // montant de recettes à sortir vers le coffre
    if (aLever > 0) {
      await createMovementInTx(tx, {
        type: "LEVEE",
        mode,
        montant: -aLever,
        caisseId: params.caisseId,
        sessionId: params.sessionId,
        auteurId: params.auteurId,
        motif: "Levée des recettes vers le coffre (clôture)",
        justificatif: params.justificatif,
      });
      levees.push({ mode, montant: -aLever });
    }
  }

  return levees;
}

/**
 * Variante transactionnelle de computeSoldeSession (lecture verrouillée dans la même tx).
 */
async function computeSoldeSessionInTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<SoldeTheoriqueParMode[]> {
  const mouvements = await tx.mouvementCaisse.findMany({
    where: { sessionId },
    select: { mode: true, montant: true },
  });

  const soldes = new Map<string, number>();
  for (const m of mouvements) {
    soldes.set(m.mode, (soldes.get(m.mode) ?? 0) + Number(m.montant));
  }
  return Array.from(soldes.entries()).map(([mode, solde]) => ({ mode, solde }));
}

/**
 * Compute theoretical balance for legacy cash/mobile money fields.
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

/**
 * List all movements for a caisse, ordered by creation time (desc).
 */
export async function listCaisseMovements(caisseId: string) {
  return prisma.mouvementCaisse.findMany({
    where: { caisseId },
    orderBy: { createdAt: "desc" },
    include: {
      auteur: { select: { id: true, nom: true } },
      vente: { select: { id: true, numero: true } },
    },
  });
}
