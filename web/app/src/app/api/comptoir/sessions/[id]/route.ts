import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { hasRole } from "@/lib/permissions";
import { closeSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

interface SoldeTheorique {
  cash: number;
  mobileMoney: number;
}

async function computeSoldeTheorique(
  sessionId: string,
  montantOuvertureCash: number,
  montantOuvertureMobileMoney: number
): Promise<SoldeTheorique> {
  // Espèces encaissées
  const especesAgg = await prisma.paiement.aggregate({
    where: {
      mode: "ESPECES",
      vente: { sessionId, statut: "VALIDEE" },
    },
    _sum: { montant: true },
  });

  // Mobile Money encaissé
  const mobileMoneyAgg = await prisma.paiement.aggregate({
    where: {
      mode: "MOBILE_MONEY",
      vente: { sessionId, statut: "VALIDEE" },
    },
    _sum: { montant: true },
  });

  // Total des ventes validées
  const ventesAgg = await prisma.vente.aggregate({
    where: { sessionId, statut: "VALIDEE" },
    _sum: { total: true },
  });

  // Total de TOUS les paiements des ventes validées
  const totalPaiementsAgg = await prisma.paiement.aggregate({
    where: {
      vente: { sessionId, statut: "VALIDEE" },
    },
    _sum: { montant: true },
  });

  const especesRecues = Number(especesAgg._sum.montant ?? 0);
  const mobileMoneyRecu = Number(mobileMoneyAgg._sum.montant ?? 0);
  const totalVentes = Number(ventesAgg._sum.total ?? 0);
  const totalPaiements = Number(totalPaiementsAgg._sum.montant ?? 0);

  // Monnaie rendue = excédent payé (uniquement en espèces)
  const monnaieRendue = totalPaiements - totalVentes;

  return {
    cash: montantOuvertureCash + especesRecues - monnaieRendue,
    mobileMoney: montantOuvertureMobileMoney + mobileMoneyRecu,
  };
}

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

    let soldeTheoriqueCash: number | null = null;
    let soldeTheoriqueMobileMoney: number | null = null;
    if (session.statut === "OUVERTE") {
      const solde = await computeSoldeTheorique(
        id,
        Number(session.montantOuvertureCash),
        Number(session.montantOuvertureMobileMoney)
      );
      soldeTheoriqueCash = solde.cash;
      soldeTheoriqueMobileMoney = solde.mobileMoney;
    } else {
      soldeTheoriqueCash = session.soldeTheoriqueCash ? Number(session.soldeTheoriqueCash) : null;
      soldeTheoriqueMobileMoney = session.soldeTheoriqueMobileMoney ? Number(session.soldeTheoriqueMobileMoney) : null;
    }

    return Response.json({
      data: {
        ...session,
        soldeTheoriqueCash,
        soldeTheoriqueMobileMoney,
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

    const solde = await computeSoldeTheorique(
      id,
      Number(session.montantOuvertureCash),
      Number(session.montantOuvertureMobileMoney)
    );
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
