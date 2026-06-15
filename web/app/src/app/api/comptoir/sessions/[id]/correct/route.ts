import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { correctiveSessionSchema } from "@/lib/validations/mouvement-caisse";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { createMovementInTx } from "@/lib/services/cash-movement";
import { computeHashForSession } from "@/lib/services/integrity";
import * as bcrypt from "bcryptjs";

const CORRECTABLE_STATUSES = ["VALIDEE", "FORCEE"];

/**
 * POST — ACT-CORRECTIVE-SESSION / RULE-CORRECTION-001
 * ADMIN creates a corrective session linked to a validated/forced session.
 * Does NOT modify the original session's movements.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = correctiveSessionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Re-authentication
    const admin = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { motDePasse: true },
    });
    if (!admin) {
      return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }
    const passwordValid = await bcrypt.compare(parsed.data.motDePasse, admin.motDePasse);
    if (!passwordValid) {
      return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }

    const originalSession = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true, statut: true, userId: true, sessionCorrective: true },
    });

    if (!originalSession) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (!CORRECTABLE_STATUSES.includes(originalSession.statut)) {
      return Response.json(
        { error: `Correction impossible pour une session en statut ${originalSession.statut}` },
        { status: 422 },
      );
    }

    // Only one corrective session per original
    if (originalSession.sessionCorrective) {
      return Response.json(
        { error: "Cette session a déjà été corrigée" },
        { status: 422 },
      );
    }

    // P0-005: Resolve caisse with early return if none active
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json({ error: "Aucune caisse active configuree" }, { status: 422 });
    }
    const caisseId = caisse.id;

    // Create corrective session + movements in a transaction
    const correctiveResult = await prisma.$transaction(async (tx) => {
      const corrective = await tx.comptoirSession.create({
        data: {
          montantOuvertureCash: 0,
          montantOuvertureMobileMoney: 0,
          userId: result.user.id,
          statut: "VALIDEE",
          fermetureAt: new Date(),
          notes: `Session corrective: ${parsed.data.motif}`,
          sessionCorrigeeId: id,
        },
      });

      // Create CORRECTION movements
      for (const mvt of parsed.data.mouvements) {
        await createMovementInTx(tx, {
          type: "CORRECTION",
          mode: mvt.mode as string,
          montant: mvt.montant,
          caisseId,
          sessionId: corrective.id,
          auteurId: result.user.id,
          motif: mvt.motif,
        });
      }

      // Mark original session as CORRIGEE
      await tx.comptoirSession.update({
        where: { id },
        data: { statut: "CORRIGEE" },
      });

      // P1-002: Compute hash inside the transaction
      const hash = await computeHashForSession(corrective.id, corrective.fermetureAt!);
      await tx.comptoirSession.update({
        where: { id: corrective.id },
        data: { hashIntegrite: hash },
      });

      return { corrective, hash };
    });

    const { corrective: correctiveSession, hash } = correctiveResult;

    await logActivity({
      action: ACTIONS.SESSION_CORRECTED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        originalSessionId: id,
        correctiveSessionId: correctiveSession.id,
        motif: parsed.data.motif,
        mouvements: parsed.data.mouvements,
        hash,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        originalSessionId: id,
        correctiveSessionId: correctiveSession.id,
        hash,
      },
    }, { status: 201 });
  } catch (error) {
    console.error(`[POST /api/comptoir/sessions/${id}/correct]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
