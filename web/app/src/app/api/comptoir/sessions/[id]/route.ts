import { prisma } from "@/lib/db";
import { requireAuth, hasRole } from "@/lib/permissions";
import { closeSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import {
  computeSoldeTheoriqueLegacy,
  computeSoldeTheoriqueParMode,
} from "@/lib/services/cash-movement";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nom: true, email: true } },
        ventes: {
          select: { id: true, numero: true, total: true, statut: true, dateVente: true },
        },
      },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    // Compute theoretical balance from cash movements
    const soldesParMode = await computeSoldeTheoriqueParMode(id);

    let soldeTheoriqueCash: number | null = null;
    let soldeTheoriqueMobileMoney: number | null = null;

    if (session.statut === "OUVERTE" || session.statut === "EN_ATTENTE_CLOTURE" || session.statut === "EN_ATTENTE_VALIDATION") {
      const legacy = await computeSoldeTheoriqueLegacy(id);
      soldeTheoriqueCash = legacy.cash;
      soldeTheoriqueMobileMoney = legacy.mobileMoney;
    } else {
      soldeTheoriqueCash = session.soldeTheoriqueCash ? Number(session.soldeTheoriqueCash) : null;
      soldeTheoriqueMobileMoney = session.soldeTheoriqueMobileMoney ? Number(session.soldeTheoriqueMobileMoney) : null;
    }

    return Response.json({
      data: {
        ...session,
        soldeTheoriqueCash,
        soldeTheoriqueMobileMoney,
        soldesParMode,
        ecartCash: session.ecartCash ? Number(session.ecartCash) : null,
        ecartMobileMoney: session.ecartMobileMoney ? Number(session.ecartMobileMoney) : null,
      },
    });
  } catch (error) {
    console.error(`[GET /api/comptoir/sessions/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({ where: { id } });
    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (session.statut === "FERMEE") {
      return Response.json({ error: "Cette session est déjà fermée" }, { status: 422 });
    }

    // CAISSIER can only close their own session
    if (
      session.userId !== result.user.id &&
      !hasRole(result.user.role, ["ADMIN", "MANAGER"])
    ) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = closeSessionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const solde = await computeSoldeTheoriqueLegacy(id);
    const ecartCash = parsed.data.montantFermetureCash - solde.cash;
    const ecartMobileMoney = parsed.data.montantFermetureMobileMoney - solde.mobileMoney;

    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "FERMEE",
        fermetureAt: new Date(),
        montantFermetureCash: parsed.data.montantFermetureCash,
        montantFermetureMobileMoney: parsed.data.montantFermetureMobileMoney,
        soldeTheoriqueCash: solde.cash,
        soldeTheoriqueMobileMoney: solde.mobileMoney,
        ecartCash,
        ecartMobileMoney,
        notes: parsed.data.notes,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    const ventesAggClose = await prisma.vente.aggregate({
      where: { sessionId: id, statut: "VALIDEE" },
      _count: { id: true },
      _sum: { total: true },
    });

    await logActivity({
      action: ACTIONS.COMPTOIR_SESSION_CLOSED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        montantFermetureCash: parsed.data.montantFermetureCash,
        montantFermetureMobileMoney: parsed.data.montantFermetureMobileMoney,
        soldeTheoriqueCash: solde.cash,
        soldeTheoriqueMobileMoney: solde.mobileMoney,
        ecartCash,
        ecartMobileMoney,
        closedByOwner: session.userId === result.user.id,
        ouvertureAt: session.ouvertureAt.toISOString(),
        fermetureAt: updated.fermetureAt?.toISOString() ?? null,
        nbVentes: ventesAggClose._count.id,
        caTotal: Number(ventesAggClose._sum.total ?? 0),
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        ...updated,
        soldeTheoriqueCash: Number(updated.soldeTheoriqueCash),
        soldeTheoriqueMobileMoney: Number(updated.soldeTheoriqueMobileMoney),
        ecartCash: Number(updated.ecartCash),
        ecartMobileMoney: Number(updated.ecartMobileMoney),
      },
    });
  } catch (error) {
    console.error(`[PUT /api/comptoir/sessions/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
