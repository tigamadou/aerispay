import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { hasRole } from "@/lib/permissions";
import { closeSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

async function computeSoldeTheorique(sessionId: string, montantOuverture: number): Promise<number> {
  // Total espèces encaissées (paiements ESPECES des ventes VALIDEE de cette session)
  const especesAgg = await prisma.paiement.aggregate({
    where: {
      mode: "ESPECES",
      vente: { sessionId, statut: "VALIDEE" },
    },
    _sum: { montant: true },
  });

  // Total des ventes validées (pour calculer la monnaie rendue)
  const ventesAgg = await prisma.vente.aggregate({
    where: { sessionId, statut: "VALIDEE" },
    _sum: { total: true },
  });

  // Total de TOUS les paiements (toutes méthodes) des ventes validées
  const totalPaiementsAgg = await prisma.paiement.aggregate({
    where: {
      vente: { sessionId, statut: "VALIDEE" },
    },
    _sum: { montant: true },
  });

  const especesRecues = Number(especesAgg._sum.montant ?? 0);
  const totalVentes = Number(ventesAgg._sum.total ?? 0);
  const totalPaiements = Number(totalPaiementsAgg._sum.montant ?? 0);

  // Monnaie rendue = total paiements - total ventes (l'excédent payé en espèces)
  const monnaieRendue = totalPaiements - totalVentes;

  // Solde théorique = fond de caisse + espèces reçues - monnaie rendue
  return montantOuverture + especesRecues - monnaieRendue;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.caisseSession.findUnique({
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

    // Compute live theoretical balance for open sessions
    let soldeTheorique: number | null = null;
    if (session.statut === "OUVERTE") {
      soldeTheorique = await computeSoldeTheorique(id, Number(session.montantOuverture));
    } else {
      soldeTheorique = session.soldeTheorique ? Number(session.soldeTheorique) : null;
    }

    return Response.json({
      data: {
        ...session,
        soldeTheorique,
        ecartCaisse: session.ecartCaisse ? Number(session.ecartCaisse) : null,
      },
    });
  } catch (error) {
    console.error(`[GET /api/caisse/sessions/${id}]`, error);
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
    const session = await prisma.caisseSession.findUnique({ where: { id } });
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

    const soldeTheorique = await computeSoldeTheorique(id, Number(session.montantOuverture));
    const ecartCaisse = parsed.data.montantFermeture - soldeTheorique;

    const updated = await prisma.caisseSession.update({
      where: { id },
      data: {
        statut: "FERMEE",
        fermetureAt: new Date(),
        montantFermeture: parsed.data.montantFermeture,
        soldeTheorique,
        ecartCaisse,
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
      action: ACTIONS.CASH_SESSION_CLOSED,
      actorId: result.user.id,
      entityType: "CashSession",
      entityId: id,
      metadata: {
        montantFermeture: parsed.data.montantFermeture,
        soldeTheorique,
        ecartCaisse,
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
        soldeTheorique: Number(updated.soldeTheorique),
        ecartCaisse: Number(updated.ecartCaisse),
      },
    });
  } catch (error) {
    console.error(`[PUT /api/caisse/sessions/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
