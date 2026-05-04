import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { forceCloseSchema } from "@/lib/validations/mouvement-caisse";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeHashForSession } from "@/lib/services/integrity";
import * as bcrypt from "bcryptjs";

const ALLOWED_STATUSES = ["OUVERTE", "EN_ATTENTE_CLOTURE", "EN_ATTENTE_VALIDATION", "CONTESTEE"];

/**
 * POST — ACT-FORCE-CLOSE
 * Admin-only. Requires re-authentication (password).
 * Transitions from OPEN/PENDING_CLOSURE/PENDING_VALIDATION/DISPUTED → FORCE_CLOSED.
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
    const parsed = forceCloseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Re-authentication: verify password
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

    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true, statut: true, userId: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (!ALLOWED_STATUSES.includes(session.statut)) {
      return Response.json(
        { error: `Force-close impossible depuis le statut ${session.statut}` },
        { status: 422 },
      );
    }

    const now = new Date();
    const hash = await computeHashForSession(id, now);

    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "FORCEE",
        fermetureAt: now,
        motifForceClose: parsed.data.motif,
        hashIntegrite: hash,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    await logActivity({
      action: ACTIONS.SESSION_FORCE_CLOSED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        motif: parsed.data.motif,
        previousStatut: session.statut,
        caissierUserId: session.userId,
        hash,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: updated });
  } catch (error) {
    console.error(`[POST /api/comptoir/sessions/${id}/force-close]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
