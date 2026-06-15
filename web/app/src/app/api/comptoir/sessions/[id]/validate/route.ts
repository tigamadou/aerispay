import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { validationAveugSchema } from "@/lib/validations/mouvement-caisse";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";
import { reconcile } from "@/lib/services/reconciliation";
import { computeHashForSession } from "@/lib/services/integrity";

/**
 * POST — ACT-BLIND-VALIDATE + ACT-RECONCILE
 * A third party (MANAGER, ADMIN, or incoming CAISSIER) submits blind count.
 * System reconciles and transitions to VALIDATED, RECOUNT_NEEDED, or DISPUTED.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  if (!hasPermission(result.user.role, "comptoir:valider_session")) {
    return Response.json(
      { error: "Seul un MANAGER ou ADMIN peut valider une session" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: {
        id: true,
        statut: true,
        userId: true,
        declarationsCaissier: true,
        tentativesRecomptage: true,
      },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (session.statut !== "EN_ATTENTE_VALIDATION") {
      return Response.json(
        { error: "La session n'est pas en attente de validation" },
        { status: 422 },
      );
    }

    // RULE-AUTH-003: validator must be different from session owner
    if (session.userId === result.user.id) {
      return Response.json(
        { error: "Un caissier ne peut pas valider sa propre session" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = validationAveugSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const declarationsValideur = parsed.data.declarations as Record<string, number>;
    const declarationsCaissier = (session.declarationsCaissier as Record<string, number>) ?? {};

    // Compute theoretical balances
    const soldesParMode = await computeSoldeTheoriqueParMode(id);

    // Run reconciliation
    const reconcResult = await reconcile(
      soldesParMode,
      declarationsCaissier,
      declarationsValideur,
      session.tentativesRecomptage,
    );

    await logActivity({
      action: ACTIONS.BLIND_VALIDATION_SUBMITTED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        declarationsValideur,
        outcome: reconcResult.outcome,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    if (reconcResult.outcome === "VALIDATED") {
      // Build final ecarts par mode
      const ecartsParMode: Record<string, {
        theorique: number; declareCaissier: number; declareValideur: number;
        montantReference: number; ecart: number; categorie: string | null;
      }> = {};
      for (const m of reconcResult.modes) {
        ecartsParMode[m.mode] = {
          theorique: m.theorique,
          declareCaissier: m.declareCaissier,
          declareValideur: m.declareValideur,
          montantReference: m.montantReference,
          ecart: m.ecartFinal,
          categorie: m.categorie,
        };
      }

      const now = new Date();
      const hash = await computeHashForSession(id, now);

      const updated = await prisma.comptoirSession.update({
        where: { id },
        data: {
          statut: "VALIDEE",
          fermetureAt: now,
          declarationsValideur,
          valideurId: result.user.id,
          ecartsParMode,
          hashIntegrite: hash,
        },
        include: { user: { select: { id: true, nom: true, email: true } } },
      });

      await logActivity({
        action: ACTIONS.SESSION_VALIDATED,
        actorId: result.user.id,
        entityType: "ComptoirSession",
        entityId: id,
        metadata: { ecartsParMode, hash },
        ipAddress: getClientIp(req),
        userAgent: getClientUserAgent(req),
      });

      // Emit discrepancy alert if any non-zero ecart
      const hasDiscrepancy = reconcResult.modes.some((m) => m.ecartFinal !== 0);
      if (hasDiscrepancy) {
        await logActivity({
          action: ACTIONS.DISCREPANCY_ALERT_TRIGGERED,
          actorId: result.user.id,
          entityType: "ComptoirSession",
          entityId: id,
          metadata: {
            caissierUserId: session.userId,
            ecartsParMode,
          },
          ipAddress: getClientIp(req),
          userAgent: getClientUserAgent(req),
        });
      }

      return Response.json({
        data: {
          ...updated,
          reconciliation: { outcome: "VALIDATED", modes: reconcResult.modes },
        },
      });
    }

    if (reconcResult.outcome === "RECOUNT_NEEDED") {
      // Increment recount attempts, stay in EN_ATTENTE_VALIDATION
      const updated = await prisma.comptoirSession.update({
        where: { id },
        data: {
          tentativesRecomptage: { increment: 1 },
          declarationsValideur: Prisma.DbNull, // Clear for next attempt
        },
        include: { user: { select: { id: true, nom: true, email: true } } },
      });

      return Response.json({
        data: {
          ...updated,
          reconciliation: {
            outcome: "RECOUNT_NEEDED",
            reason: reconcResult.reason,
            modes: reconcResult.modes,
          },
        },
      }, { status: 409 });
    }

    // DISPUTED
    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "CONTESTEE",
        declarationsValideur,
        valideurId: result.user.id,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    await logActivity({
      action: ACTIONS.SESSION_DISPUTED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        reason: reconcResult.reason,
        tentativesRecomptage: session.tentativesRecomptage,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        ...updated,
        reconciliation: {
          outcome: "DISPUTED",
          reason: reconcResult.reason,
          modes: reconcResult.modes,
        },
      },
    }, { status: 409 });
  } catch (error) {
    console.error(`[POST /api/comptoir/sessions/${id}/validate]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
