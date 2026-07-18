import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { issueEnrollmentToken } from "@/lib/services/enrollment-token";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const enrollSchema = z.object({
  terminalId: z.string().min(1),
  label: z.string().max(100).optional(),
  ttlMinutes: z.number().int().positive().max(1440).optional(),
});

/**
 * Émission d'un code d'enrôlement (ADR-007, single-use) par un ADMIN, pour un terminal
 * pré-créé. Le poste l'échange ensuite (POST /api/enrollment/exchange) contre un token
 * de magasin. Le code en clair n'est renvoyé qu'une fois.
 */
export async function POST(req: Request): Promise<Response> {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const parsed = enrollSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const caisse = await prisma.terminalCaisse.findUnique({
      where: { id: parsed.data.terminalId },
      select: { id: true, active: true, code: true },
    });
    if (!caisse || !caisse.active) {
      return Response.json({ error: "Caisse introuvable ou inactive" }, { status: 422 });
    }

    // Règle 1:1 — un terminal n'est associé qu'à un seul poste à la fois. Si un jeton
    // de magasin actif existe déjà, on refuse d'enrôler une nouvelle machine (il faut
    // d'abord révoquer le jeton existant).
    const jetonActif = await prisma.storeToken.findFirst({
      where: { terminalId: caisse.id, revoked: false },
      select: { id: true },
    });
    if (jetonActif) {
      return Response.json(
        { error: "Terminal déjà associé à un poste — révoquez son jeton avant de ré-enrôler." },
        { status: 409 },
      );
    }

    const { token, id, expiresAt } = await issueEnrollmentToken({
      terminalId: caisse.id,
      label: parsed.data.label,
      ttlMinutes: parsed.data.ttlMinutes,
    });

    await logActivity({
      action: ACTIONS.POSTE_ENROLLED,
      actorId: result.user.id,
      entityType: "TerminalCaisse",
      entityId: caisse.id,
      metadata: { enrollmentTokenId: id, codePoste: caisse.code, label: parsed.data.label },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json(
      { data: { enrollmentToken: token, terminalId: caisse.id, codePoste: caisse.code, expiresAt } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/enrollment]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
