import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { verifySessionIntegrity } from "@/lib/services/integrity";

const VERIFIABLE_STATUSES = ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"];

/**
 * POST — ACT-VERIFY-INTEGRITY / RULE-INTEGRITY-002
 * MANAGER or ADMIN verifies the integrity hash of a closed session.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  if (!hasPermission(result.user.role, "comptoir:verifier_integrite")) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true, statut: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (!VERIFIABLE_STATUSES.includes(session.statut)) {
      return Response.json(
        { error: `Vérification impossible pour une session en statut ${session.statut}` },
        { status: 422 },
      );
    }

    const result2 = await verifySessionIntegrity(id);

    await logActivity({
      action: ACTIONS.INTEGRITY_CHECK_PERFORMED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        valid: result2.valid,
        storedHash: result2.storedHash,
        computedHash: result2.computedHash,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        sessionId: id,
        valid: result2.valid,
        storedHash: result2.storedHash,
        computedHash: result2.computedHash,
      },
    });
  } catch (error) {
    console.error(`[POST /api/comptoir/sessions/${id}/verify]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
