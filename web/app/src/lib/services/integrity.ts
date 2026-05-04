import { createHash } from "crypto";
import { prisma } from "@/lib/db";

interface HashInput {
  sessionId: string;
  userId: string;
  ouvertureAt: string; // ISO 8601
  validationAt: string; // ISO 8601
  mouvements: Array<{
    id: string;
    type: string;
    montant: string;
    mode: string;
    createdAt: string;
  }>;
  declarationsCaissier: Record<string, number>;
  declarationsValideur: Record<string, number> | null;
  ecarts: Record<string, number>;
  hashPrecedent: string;
}

/**
 * RULE-INTEGRITY-001: Compute SHA-256 hash for a validated session.
 * Data is concatenated in deterministic order, separated by '|'.
 */
export function computeSessionHash(input: HashInput): string {
  const parts: string[] = [
    input.sessionId,
    input.userId,
    input.ouvertureAt,
    input.validationAt,
  ];

  // Movements sorted by createdAt then id
  const sortedMovements = [...input.mouvements].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
  for (const m of sortedMovements) {
    parts.push(`${m.id}:${m.type}:${m.montant}:${m.mode}:${m.createdAt}`);
  }

  // Cashier declarations sorted by mode
  const cashierModes = Object.keys(input.declarationsCaissier).sort();
  for (const mode of cashierModes) {
    parts.push(`C:${mode}:${input.declarationsCaissier[mode]}`);
  }

  // Validator declarations sorted by mode (empty if force-close)
  if (input.declarationsValideur) {
    const valideurModes = Object.keys(input.declarationsValideur).sort();
    for (const mode of valideurModes) {
      parts.push(`V:${mode}:${input.declarationsValideur[mode]}`);
    }
  }

  // Discrepancies sorted by mode
  const ecartModes = Object.keys(input.ecarts).sort();
  for (const mode of ecartModes) {
    parts.push(`E:${mode}:${input.ecarts[mode]}`);
  }

  // Previous session hash (empty string if first session)
  parts.push(input.hashPrecedent);

  const data = parts.join("|");
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Build hash input from a session and its movements, then compute the hash.
 */
export async function computeHashForSession(
  sessionId: string,
  validationAt: Date,
): Promise<string> {
  const session = await prisma.comptoirSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      ouvertureAt: true,
      declarationsCaissier: true,
      declarationsValideur: true,
      ecartsParMode: true,
    },
  });

  const mouvements = await prisma.mouvementCaisse.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, montant: true, mode: true, createdAt: true },
  });

  // Find previous session's hash for chaining
  const previousSession = await prisma.comptoirSession.findFirst({
    where: {
      id: { not: sessionId },
      statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] },
      ouvertureAt: { lt: session.ouvertureAt },
    },
    orderBy: { ouvertureAt: "desc" },
    select: { hashIntegrite: true },
  });

  const ecarts: Record<string, number> = {};
  const ecartsParMode = session.ecartsParMode as Record<string, { ecart: number }> | null;
  if (ecartsParMode) {
    for (const [mode, data] of Object.entries(ecartsParMode)) {
      ecarts[mode] = data.ecart;
    }
  }

  return computeSessionHash({
    sessionId: session.id,
    userId: session.userId,
    ouvertureAt: session.ouvertureAt.toISOString(),
    validationAt: validationAt.toISOString(),
    mouvements: mouvements.map((m) => ({
      id: m.id,
      type: m.type,
      montant: String(m.montant),
      mode: m.mode,
      createdAt: m.createdAt.toISOString(),
    })),
    declarationsCaissier: (session.declarationsCaissier as Record<string, number>) ?? {},
    declarationsValideur: (session.declarationsValideur as Record<string, number>) ?? null,
    ecarts,
    hashPrecedent: previousSession?.hashIntegrite ?? "",
  });
}

/**
 * RULE-INTEGRITY-002: Verify integrity of a validated session.
 * Recalculates the hash and compares with the stored one.
 */
export async function verifySessionIntegrity(
  sessionId: string,
): Promise<{ valid: boolean; storedHash: string | null; computedHash: string }> {
  const session = await prisma.comptoirSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { hashIntegrite: true, fermetureAt: true },
  });

  const computedHash = await computeHashForSession(
    sessionId,
    session.fermetureAt ?? new Date(),
  );

  return {
    valid: session.hashIntegrite === computedHash,
    storedHash: session.hashIntegrite,
    computedHash,
  };
}
