import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { openSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeCaisseParMode, createMovementInTx } from "@/lib/services/cash-movement";
import { getSeuil } from "@/lib/services/seuils";
import { categorizeDiscrepancy } from "@/lib/services/reconciliation";

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

    const { declarations, confirmeEcart, caisseId: caisseIdParam } = parsed.data;

    // F1.1 — Résolution multi-caisse
    let caisse: { id: string };
    if (caisseIdParam) {
      const found = await prisma.caisse.findUnique({
        where: { id: caisseIdParam },
        select: { id: true, active: true },
      });
      if (!found || !found.active) {
        return Response.json(
          { error: "Caisse introuvable ou inactive" },
          { status: 422 },
        );
      }
      caisse = found;
    } else {
      const caisses = await prisma.caisse.findMany({ where: { active: true }, select: { id: true } });
      if (caisses.length === 0) {
        return Response.json(
          { error: "Aucune caisse active configurée" },
          { status: 422 },
        );
      }
      if (caisses.length >= 2) {
        return Response.json(
          { error: "caisseId requis : plusieurs caisses actives" },
          { status: 400 },
        );
      }
      caisse = caisses[0];
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

    // RULE-FOND-004 / RULE-SEUIL-001 : catégorisation via seuils paramétrables (zéro valeur en dur),
    // mêmes bornes (MINEUR + MEDIUM) que la réconciliation.
    const seuilMineur = await getSeuil("THRESHOLD_DISCREPANCY_MINOR");
    const seuilMajeur = await getSeuil("THRESHOLD_DISCREPANCY_MEDIUM");

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
          // categorizeDiscrepancy ne renvoie null que pour ecart == 0 (exclu ici)
          categorie: categorizeDiscrepancy(ecart, seuilMineur, seuilMajeur) ?? "MINEUR",
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

    // RULE-FOND-004 : un écart d'ouverture est imputé à la session précédente finalisée
    const sessionPrecedente = hasEcarts
      ? await prisma.comptoirSession.findFirst({
          where: { statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] } },
          orderBy: { ouvertureAt: "desc" },
          select: { id: true },
        })
      : null;

    // F1.1 (RULE-CAISSE-002, Option B — multi-caisse) :
    // 1 session OUVERTE par caisse ET 1 par caissier, vérifiées atomiquement.
    const session = await prisma.$transaction(async (tx) => {
      const existingCaisse = await tx.comptoirSession.findFirst({
        where: { statut: "OUVERTE", caisseId: caisse.id },
      });
      if (existingCaisse) {
        return { conflict: "CAISSE_DEJA_OUVERTE" } as const;
      }

      const existingCaissier = await tx.comptoirSession.findFirst({
        where: { statut: "OUVERTE", userId: result.user.id },
      });
      if (existingCaissier) {
        return { conflict: "CAISSIER_SESSION_DEJA_OUVERTE" } as const;
      }

      const created = await tx.comptoirSession.create({
        data: {
          montantOuvertureCash,
          montantOuvertureMobileMoney,
          declarationsOuverture: declarations,
          ecartsOuverture: hasEcarts ? JSON.parse(JSON.stringify(ecarts)) : undefined,
          ecartOuvertureImputeSessionId: sessionPrecedente?.id ?? null,
          userId: result.user.id,
          caisseId: caisse.id,
        },
        include: { user: { select: { id: true, nom: true, email: true } } },
      });

      // RULE-FOND-001 : le fond d'ouverture devient un MouvementCaisse rattaché à la session,
      // par mode (= montant retenu à l'ouverture). computeSoldeSession l'inclut donc nativement.
      for (const [mode, montant] of Object.entries(declarations)) {
        if (montant > 0) {
          await createMovementInTx(tx, {
            type: "FOND_OUVERTURE",
            mode,
            montant,
            caisseId: caisse.id,
            sessionId: created.id,
            auteurId: result.user.id,
            motif: "Fond d'ouverture de session",
          });
        }
      }

      return created;
    });

    if (session && "conflict" in session) {
      if (session.conflict === "CAISSE_DEJA_OUVERTE") {
        return Response.json(
          { error: "Une session est déjà ouverte sur cette caisse. Clôturez-la avant d'en ouvrir une nouvelle." },
          { status: 409 }
        );
      }
      return Response.json(
        { error: "Vous avez déjà une session ouverte sur une autre caisse." },
        { status: 409 }
      );
    }
    if (!session) {
      return Response.json({ error: "Erreur lors de la création de la session" }, { status: 500 });
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
