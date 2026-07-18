import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { listMovements, computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

const REPORT_STATUSES = ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"];

/**
 * GET — ACT-GENERATE-Z
 * Returns structured Z de caisse data for a closed session.
 * MANAGER or ADMIN only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nom: true, email: true } },
        valideur: { select: { id: true, nom: true } },
        ventes: {
          where: { statut: "VALIDEE" },
          select: { id: true, numero: true, total: true, dateVente: true },
          orderBy: { dateVente: "asc" },
        },
        sessionCorrective: {
          select: {
            id: true,
            notes: true,
            hashIntegrite: true,
            mouvementsCaisse: {
              select: { id: true, type: true, mode: true, montant: true, motif: true, createdAt: true },
            },
          },
        },
      },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (!REPORT_STATUSES.includes(session.statut)) {
      return Response.json(
        { error: `Z de caisse non disponible pour le statut ${session.statut}` },
        { status: 422 },
      );
    }

    const mouvements = await listMovements(id);
    const soldesParMode = await computeSoldeTheoriqueParMode(id);

    // Aggregate sales stats
    const nbVentes = session.ventes.length;
    const totalVentes = session.ventes.reduce((sum, v) => sum + Number(v.total), 0);

    // Movements by type
    const mouvementsParType: Record<string, { count: number; total: number }> = {};
    for (const m of mouvements) {
      if (!mouvementsParType[m.type]) {
        mouvementsParType[m.type] = { count: 0, total: 0 };
      }
      mouvementsParType[m.type].count++;
      mouvementsParType[m.type].total += Number(m.montant);
    }

    const report = {
      session: {
        id: session.id,
        statut: session.statut,
        caissier: session.user,
        valideur: session.valideur,
        ouvertureAt: session.ouvertureAt,
        fermetureAt: session.fermetureAt,
        demandeCloturAt: session.demandeCloturAt,
        fondCaisseCash: Number(session.montantOuvertureCash),
        fondCaisseMobileMoney: Number(session.montantOuvertureMobileMoney),
        motifForceClose: session.motifForceClose,
      },
      ventes: {
        nombre: nbVentes,
        total: totalVentes,
        detail: session.ventes,
      },
      mouvements: {
        liste: mouvements.map((m) => ({
          id: m.id,
          type: m.type,
          mode: m.mode,
          montant: Number(m.montant),
          motif: m.motif,
          reference: m.reference,
          auteur: m.auteur,
          vente: m.vente,
          createdAt: m.createdAt,
        })),
        parType: mouvementsParType,
      },
      soldesTheoriques: soldesParMode,
      declarations: {
        caissier: session.declarationsCaissier,
        valideur: session.declarationsValideur,
      },
      ecarts: session.ecartsParMode,
      integrite: {
        hash: session.hashIntegrite,
        hashSessionPrecedente: session.hashSessionPrecedente,
      },
      correction: session.sessionCorrective
        ? {
            id: session.sessionCorrective.id,
            notes: session.sessionCorrective.notes,
            hash: session.sessionCorrective.hashIntegrite,
            mouvements: session.sessionCorrective.mouvementsCaisse.map((m) => ({
              type: m.type,
              mode: m.mode,
              montant: Number(m.montant),
              motif: m.motif,
            })),
          }
        : null,
    };

    return Response.json({ data: report });
  } catch (error) {
    console.error(`[GET /api/comptoir/sessions/${id}/z-report]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
