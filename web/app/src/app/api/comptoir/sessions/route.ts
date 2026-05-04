import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { openSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

export async function GET() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    // IDOR protection: CAISSIER can only list their own sessions
    const where = result.user.role === "CAISSIER"
      ? { userId: result.user.id }
      : {};

    const sessions = await prisma.comptoirSession.findMany({
      where,
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
  const result = await requireAuth();
  if (!result.authenticated) return result.response;
  if (!hasPermission(result.user.role, "comptoir:vendre")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = openSessionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
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

    // Compare declared amounts with caisse balances
    const soldeCaisseCash = soldes.find((s) => s.mode === "ESPECES")?.solde ?? 0;
    const soldeCaisseAutres = soldes.filter((s) => s.mode !== "ESPECES").reduce((sum, s) => sum + s.solde, 0);
    const ecartOuvertureCash = parsed.data.montantOuvertureCash - soldeCaisseCash;
    const ecartOuvertureAutres = parsed.data.montantOuvertureMobileMoney - soldeCaisseAutres;
    const hasEcartOuverture = Math.abs(ecartOuvertureCash) > 0.01 || Math.abs(ecartOuvertureAutres) > 0.01;

    // Atomically check for existing open session + create (prevents race condition)
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.comptoirSession.findFirst({
        where: { userId: result.user.id, statut: "OUVERTE" },
      });
      if (existing) {
        return null; // Signal that a session already exists
      }

      return tx.comptoirSession.create({
        data: {
          montantOuvertureCash: parsed.data.montantOuvertureCash,
          montantOuvertureMobileMoney: parsed.data.montantOuvertureMobileMoney,
          userId: result.user.id,
        },
        include: { user: { select: { id: true, nom: true, email: true } } },
      });
    });

    if (!session) {
      return Response.json(
        { error: "Vous avez déjà une session de comptoir ouverte" },
        { status: 409 }
      );
    }

    const logMetadata: Record<string, unknown> = {
      montantOuvertureCash: Number(session.montantOuvertureCash),
      montantOuvertureMobileMoney: Number(session.montantOuvertureMobileMoney),
      ouvertureAt: session.ouvertureAt.toISOString(),
    };

    if (hasEcartOuverture) {
      logMetadata.ecartOuverture = {
        soldeCaisseCash,
        soldeCaisseAutres,
        declareCash: parsed.data.montantOuvertureCash,
        declareAutres: parsed.data.montantOuvertureMobileMoney,
        ecartCash: ecartOuvertureCash,
        ecartAutres: ecartOuvertureAutres,
      };
    }

    await logActivity({
      action: ACTIONS.COMPTOIR_SESSION_OPENED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: session.id,
      metadata: logMetadata,
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    // Build warning if discrepancy detected
    const warning = hasEcartOuverture
      ? {
          message: "Le montant declare differe du solde de la caisse.",
          soldeCaisseCash,
          soldeCaisseAutres,
          ecartCash: ecartOuvertureCash,
          ecartAutres: ecartOuvertureAutres,
        }
      : undefined;

    return Response.json({ data: session, ...(warning && { warning }) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/comptoir/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
