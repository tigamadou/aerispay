import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/db";

/**
 * E3.2 — Tokens de magasin scopés par poste (ADR-003 « Simple V1 » : longue durée +
 * révocation). Le nœud magasin émet un token rattaché à une caisse (poste) ; la caisse
 * le présente sur le LAN (HTTPS). Seul le **hash SHA-256** du token est persisté — le
 * secret en clair n'est connu qu'au moment de l'émission (à stocker dans le trousseau OS
 * côté Electron). Révocation immédiate en cas de perte/vol de poste.
 */

/** Hash non réversible utilisé pour le stockage et la recherche (jamais le clair). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface IssueParams {
  terminalId: string;
  label?: string;
}

export interface IssuedToken {
  /** Secret en clair — affiché une seule fois, à stocker dans le trousseau OS du poste. */
  token: string;
  id: string;
}

/** Émet un token de magasin scoppé à une caisse. */
export async function issueStoreToken(params: IssueParams): Promise<IssuedToken> {
  const token = randomBytes(32).toString("hex");
  const created = await prisma.storeToken.create({
    data: {
      tokenHash: hashToken(token),
      terminalId: params.terminalId,
      label: params.label ?? null,
    },
  });
  return { token, id: created.id };
}

export interface VerifyResult {
  valid: boolean;
  terminalId: string | null;
  tokenId: string | null;
}

/** Vérifie un token : présent, non révoqué. Renvoie le scope (caisse). */
export async function verifyStoreToken(token: string): Promise<VerifyResult> {
  const record = await prisma.storeToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.revoked) {
    return { valid: false, terminalId: null, tokenId: null };
  }
  return { valid: true, terminalId: record.terminalId, tokenId: record.id };
}

/** Révoque un token (perte/vol de poste) : le poste ne joint plus l'API. */
export async function revokeStoreToken(tokenId: string): Promise<void> {
  await prisma.storeToken.update({
    where: { id: tokenId },
    data: { revoked: true },
  });
}
