import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { openSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { createMovementInTx } from "@/lib/services/cash-movement";

export async function GET() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const sessions = await prisma.comptoirSession.findMany({
      orderBy: { ouvertureAt: "desc" },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    return Response.json({ data: sessions });
  } catch (error) {
    console.error("[GET /api/comptoir/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("CAISSIER");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = openSessionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check for existing open session
    const existing = await prisma.comptoirSession.findFirst({
      where: { userId: result.user.id, statut: "OUVERTE" },
    });
    if (existing) {
      return Response.json(
        { error: "Vous avez déjà une session de comptoir ouverte" },
        { status: 409 }
      );
    }

    const session = await prisma.$transaction(async (tx) => {
      const sess = await tx.comptoirSession.create({
        data: {
          montantOuvertureCash: parsed.data.montantOuvertureCash,
          montantOuvertureMobileMoney: parsed.data.montantOuvertureMobileMoney,
          userId: result.user.id,
        },
        include: { user: { select: { id: true, nom: true, email: true } } },
      });

      // RULE-OPEN-002 : fond de caisse = mouvement FOND_INITIAL par mode > 0
      if (parsed.data.montantOuvertureCash > 0) {
        await createMovementInTx(tx, {
          type: "FOND_INITIAL",
          mode: "ESPECES",
          montant: parsed.data.montantOuvertureCash,
          sessionId: sess.id,
          auteurId: result.user.id,
          motif: "Fond de caisse initial",
        });
      }
      if (parsed.data.montantOuvertureMobileMoney > 0) {
        await createMovementInTx(tx, {
          type: "FOND_INITIAL",
          mode: "MOBILE_MONEY_MTN",
          montant: parsed.data.montantOuvertureMobileMoney,
          sessionId: sess.id,
          auteurId: result.user.id,
          motif: "Fond de caisse initial Mobile Money",
        });
      }

      return sess;
    });

    await logActivity({
      action: ACTIONS.COMPTOIR_SESSION_OPENED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: session.id,
      metadata: {
        montantOuvertureCash: Number(session.montantOuvertureCash),
        montantOuvertureMobileMoney: Number(session.montantOuvertureMobileMoney),
        ouvertureAt: session.ouvertureAt.toISOString(),
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: session }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/comptoir/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
