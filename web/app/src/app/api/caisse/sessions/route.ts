import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { openSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function GET() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const sessions = await prisma.caisseSession.findMany({
      orderBy: { ouvertureAt: "desc" },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    return Response.json({ data: sessions });
  } catch (error) {
    console.error("[GET /api/caisse/sessions]", error);
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
    const existing = await prisma.caisseSession.findFirst({
      where: { userId: result.user.id, statut: "OUVERTE" },
    });
    if (existing) {
      return Response.json(
        { error: "Vous avez déjà une session de caisse ouverte" },
        { status: 409 }
      );
    }

    const session = await prisma.caisseSession.create({
      data: {
        montantOuverture: parsed.data.montantOuverture,
        userId: result.user.id,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    await logActivity({
      action: ACTIONS.CASH_SESSION_OPENED,
      actorId: result.user.id,
      entityType: "CashSession",
      entityId: session.id,
      metadata: {
        montantOuverture: Number(session.montantOuverture),
        ouvertureAt: session.ouvertureAt.toISOString(),
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: session }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/caisse/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
