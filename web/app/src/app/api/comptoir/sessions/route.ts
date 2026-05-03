import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { openSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

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

    // Verifier qu'une caisse active existe et a un solde > 0
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json(
        { error: "Aucune caisse active configuree" },
        { status: 422 },
      );
    }

    const soldes = await computeSoldeCaisseParMode(caisse.id);
    const soldeTotal = soldes.reduce((sum, s) => sum + s.solde, 0);
    if (soldeTotal <= 0) {
      return Response.json(
        { error: "Impossible d'ouvrir une session : le solde de la caisse est a zero. Effectuez un apport de fonds d'abord." },
        { status: 422 },
      );
    }

    const session = await prisma.comptoirSession.create({
      data: {
        montantOuvertureCash: parsed.data.montantOuvertureCash,
        montantOuvertureMobileMoney: parsed.data.montantOuvertureMobileMoney,
        userId: result.user.id,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
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
