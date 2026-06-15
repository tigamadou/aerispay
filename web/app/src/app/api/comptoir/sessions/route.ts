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

interface EcartOuverture {
  mode: string;
  theorique: number;
  declare: number;
  ecart: number;
  categorie: "MINEUR" | "MOYEN" | "MAJEUR";
}

function categorizeEcart(ecart: number): "MINEUR" | "MOYEN" | "MAJEUR" {
  const abs = Math.abs(ecart);
  if (abs > 5000) return "MAJEUR";
  if (abs > 500) return "MOYEN";
  return "MINEUR";
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

    const { declarations, confirmeEcart } = parsed.data;

    // Verifier qu'une caisse active existe et a un solde > 0
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json(
        { error: "Aucune caisse active configuree" },
        { status: 422 },
      );
    }

    const soldes = await computeSoldeCaisseParMode(caisse.id);
    const soldeTotal = soldes.reduce((sum: number, s: { solde: number }) => sum + s.solde, 0);
    if (soldeTotal <= 0) {
      return Response.json(
        { error: "Impossible d'ouvrir une session : le solde de la caisse est a zero. Effectuez un apport de fonds d'abord." },
        { status: 422 },
      );
    }

    // Build solde map from grand livre
    const soldeMap = new Map<string, number>();
    for (const s of soldes) {
      soldeMap.set(s.mode, s.solde);
    }

    // Compare each declared mode to the grand livre
    const allModes = new Set([...Object.keys(declarations), ...soldeMap.keys()]);
    const ecarts: EcartOuverture[] = [];
    for (const mode of allModes) {
      const theorique = soldeMap.get(mode) ?? 0;
      const declare = declarations[mode] ?? 0;
      const ecart = declare - theorique;
      if (Math.abs(ecart) > 0.01) {
        ecarts.push({
          mode,
          theorique,
          declare,
          ecart,
          categorie: categorizeEcart(ecart),
        });
      }
    }

    const hasEcarts = ecarts.length > 0;

    // If ecarts exist and not confirmed, return 409
    if (hasEcarts && !confirmeEcart) {
      const ecartsRecord: Record<string, { theorique: number; declare: number; ecart: number; categorie: string }> = {};
      for (const e of ecarts) {
        ecartsRecord[e.mode] = {
          theorique: e.theorique,
          declare: e.declare,
          ecart: e.ecart,
          categorie: e.categorie,
        };
      }
      return Response.json(
        {
          requiresConfirmation: true,
          message: "Le montant declare differe du solde de la caisse. Confirmez-vous l'ouverture ?",
          ecarts: ecartsRecord,
        },
        { status: 409 },
      );
    }

    // Retrocompat: compute legacy fields from declarations
    const montantOuvertureCash = declarations["ESPECES"] ?? 0;
    const montantOuvertureMobileMoney = Object.entries(declarations)
      .filter(([mode]) => mode !== "ESPECES")
      .reduce((sum, [, val]) => sum + val, 0);

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
          montantOuvertureCash,
          montantOuvertureMobileMoney,
          declarationsOuverture: declarations,
          ecartsOuverture: hasEcarts ? JSON.parse(JSON.stringify(ecarts)) : undefined,
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
      declarations,
      ouvertureAt: session.ouvertureAt.toISOString(),
    };

    if (hasEcarts) {
      logMetadata.ecarts = ecarts;
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

    return Response.json({ data: session }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/comptoir/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
