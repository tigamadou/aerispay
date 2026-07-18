import { randomBytes } from "crypto";

import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/services/store-token";

/**
 * Token d'enrôlement à usage unique (ADR-007). Remis par l'admin, échangé une seule
 * fois par le poste contre un token de magasin (cf. exchange). Seul le hash est persisté.
 */
export interface IssueEnrollmentParams {
  terminalId: string;
  label?: string;
  ttlMinutes?: number;
}

export async function issueEnrollmentToken(
  params: IssueEnrollmentParams,
): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 60) * 60_000);
  const created = await prisma.enrollmentToken.create({
    data: { tokenHash: hashToken(token), terminalId: params.terminalId, label: params.label ?? null, expiresAt },
  });
  return { token, id: created.id, expiresAt };
}

export interface ConsumeResult {
  valid: boolean;
  terminalId: string | null;
  tokenId: string | null;
}

export async function consumeEnrollmentToken(token: string): Promise<ConsumeResult> {
  const record = await prisma.enrollmentToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
    return { valid: false, terminalId: null, tokenId: null };
  }
  // Consommation atomique : garde anti-course (un seul updateMany réussit).
  const updated = await prisma.enrollmentToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (updated.count !== 1) return { valid: false, terminalId: null, tokenId: null };
  return { valid: true, terminalId: record.terminalId, tokenId: record.id };
}
