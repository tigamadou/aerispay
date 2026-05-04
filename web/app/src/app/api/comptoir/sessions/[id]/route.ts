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

    // IDOR protection: CAISSIER can only see their own sessions
    if (result.user.role === "CAISSIER" && session.userId !== result.user.id) {
      return Response.json({ error: "Acces refuse" }, { status: 403 });
    }

    // Compute theoretical balance from cash movements
    const soldesParMode = await computeSoldeTheoriqueParMode(id);

    let soldeTheoriqueCash: number | null = null;
    let soldeTheoriqueMobileMoney: number | null = null;

    if (session.statut === "OUVERTE" || session.statut === "EN_ATTENTE_CLOTURE" || session.statut === "EN_ATTENTE_VALIDATION") {
      const legacy = await computeSoldeTheoriqueLegacy(id);
      // Include opening fund in theoretical balance (matching PUT close logic)
      soldeTheoriqueCash = Number(session.montantOuvertureCash) + legacy.cash;
      soldeTheoriqueMobileMoney = Number(session.montantOuvertureMobileMoney) + legacy.mobileMoney;
    } else {
      soldeTheoriqueCash = session.soldeTheoriqueCash ? Number(session.soldeTheoriqueCash) : null;
      soldeTheoriqueMobileMoney = session.soldeTheoriqueMobileMoney ? Number(session.soldeTheoriqueMobileMoney) : null;
    }

    // Build detailed breakdown: session movements aggregated by type × mode
    const mouvements = await prisma.mouvementCaisse.findMany({
      where: { sessionId: id },
      select: { type: true, mode: true, montant: true },
    });

    // Aggregate: { [mode]: { VENTE, REMBOURSEMENT, APPORT, RETRAIT, DEPENSE, CORRECTION } }
    const recapParMode: Record<string, Record<string, number>> = {};
    for (const m of mouvements) {
      if (!recapParMode[m.mode]) {
        recapParMode[m.mode] = {};
      }
      recapParMode[m.mode][m.type] = (recapParMode[m.mode][m.type] ?? 0) + Number(m.montant);
    }

    // Sales from Paiement table (source of truth for sales breakdown by mode)
    const paiements = await prisma.paiement.findMany({
      where: {
        vente: { sessionId: id, statut: "VALIDEE" },
      },
      select: { mode: true, montant: true },
    });

    const ventesParMode: Record<string, number> = {};
    for (const p of paiements) {
      ventesParMode[p.mode] = (ventesParMode[p.mode] ?? 0) + Number(p.montant);
    }

    // Opening fund declared by cashier (two buckets: cash / autres)
    const fondCash = Number(session.montantOuvertureCash);
    const fondAutres = Number(session.montantOuvertureMobileMoney);

    // Montant attendu: two buckets matching the close endpoint (ESPECES vs everything else)
    let mvtsCash = 0;
    let mvtsAutres = 0;
    for (const m of mouvements) {
      const val = Number(m.montant);
      if (m.mode === "ESPECES") {
        mvtsCash += val;
      } else {
        mvtsAutres += val;
      }
    }

    const montantAttenduCash = fondCash + mvtsCash;
    const montantAttenduAutres = fondAutres + mvtsAutres;

    return Response.json({
      data: {
        ...session,
        soldeTheoriqueCash,
        soldeTheoriqueMobileMoney,
        soldesParMode,
        recapParMode,
        ventesParMode,
        fondOuverture: { cash: fondCash, autres: fondAutres },
        montantAttenduCash,
        montantAttenduAutres,
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

    // Legacy PUT only works on OUVERTE sessions. For the new multi-step closure flow,
    // use POST /api/comptoir/sessions/[id]/closure instead.
    if (session.statut !== "OUVERTE") {
      return Response.json({ error: "Cette session n'est pas ouverte (utilisez le flux de clôture multi-étapes)" }, { status: 422 });
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

    // Montant attendu = fond déclaré à l'ouverture + mouvements de la session
    const solde = await computeSoldeTheoriqueLegacy(id);
    const fondCash = Number(session.montantOuvertureCash);
    const fondMM = Number(session.montantOuvertureMobileMoney);
    const attenduCash = fondCash + solde.cash;
    const attenduMM = fondMM + solde.mobileMoney;

    const ecartCash = parsed.data.montantFermetureCash - attenduCash;
    const ecartMobileMoney = parsed.data.montantFermetureMobileMoney - attenduMM;

    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "FERMEE",
        fermetureAt: new Date(),
        montantFermetureCash: parsed.data.montantFermetureCash,
        montantFermetureMobileMoney: parsed.data.montantFermetureMobileMoney,
        soldeTheoriqueCash: attenduCash,
        soldeTheoriqueMobileMoney: attenduMM,
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
        fondOuvertureCash: fondCash,
        fondOuvertureMobileMoney: fondMM,
        montantAttenduCash: attenduCash,
        montantAttenduMobileMoney: attenduMM,
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
