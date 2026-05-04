import type { TypeMouvementCaisse, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { createMouvementManuelSchema } from "@/lib/validations/mouvement-caisse";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { createMovement } from "@/lib/services/cash-movement";
import { getSeuil } from "@/lib/services/seuils";

const VALID_TYPES: TypeMouvementCaisse[] = [
  "FOND_INITIAL", "VENTE", "REMBOURSEMENT", "APPORT", "RETRAIT", "DEPENSE", "CORRECTION",
];
const VALID_MODES: string[] = [
  "ESPECES", "MOBILE_MONEY_MTN", "MOBILE_MONEY_MOOV", "CELTIS_CASH",
];

export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const skip = (page - 1) * limit;

    const typeParam = url.searchParams.get("type");
    const modeParam = url.searchParams.get("mode");
    const sessionId = url.searchParams.get("sessionId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const where: Prisma.MouvementCaisseWhereInput = {};

    // CAISSIER can only see movements from their own sessions
    if (result.user.role === "CAISSIER") {
      where.session = { userId: result.user.id };
    }

    if (typeParam && VALID_TYPES.includes(typeParam as TypeMouvementCaisse)) {
      where.type = typeParam as TypeMouvementCaisse;
    }

    if (modeParam && VALID_MODES.includes(modeParam as string)) {
      where.mode = modeParam as string;
    }

    if (sessionId) {
      where.sessionId = sessionId;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [mouvements, total] = await Promise.all([
      prisma.mouvementCaisse.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          session: { select: { id: true, userId: true } },
          auteur: { select: { id: true, nom: true } },
          vente: { select: { id: true, numero: true } },
        },
      }),
      prisma.mouvementCaisse.count({ where }),
    ]);

    return Response.json({
      data: mouvements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[GET /api/comptoir/movements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  // RULE-MVT-004: CAISSIER has comptoir:mouvement_manuel but not retrait/depense above thresholds
  if (!hasPermission(result.user.role, "comptoir:mouvement_manuel")) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createMouvementManuelSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sessionId, montant, motif, reference, justificatif } = parsed.data;
    const type = parsed.data.type as TypeMouvementCaisse;
    const mode = parsed.data.mode as string;

    // Verify session exists and is OPEN
    const session = await prisma.comptoirSession.findUnique({
      where: { id: sessionId },
      select: { id: true, statut: true, userId: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (session.statut !== "OUVERTE") {
      return Response.json(
        { error: "La session n'est pas ouverte" },
        { status: 422 },
      );
    }

    // Determine sign: APPORT is positive, RETRAIT and DEPENSE are negative
    const isOutflow = type === "RETRAIT" || type === "DEPENSE";
    const signedMontant = isOutflow ? -montant : montant;

    // RULE-AUTH-001 / RULE-AUTH-002: threshold checks for CAISSIER
    if (result.user.role === "CAISSIER") {
      if (type === "RETRAIT") {
        const seuil = await getSeuil("THRESHOLD_CASH_WITHDRAWAL_AUTH");
        if (montant > seuil) {
          return Response.json(
            { error: `Retrait de ${montant} FCFA dépasse le seuil de ${seuil} FCFA. Autorisation MANAGER ou ADMIN requise.` },
            { status: 403 },
          );
        }
      }

      if (type === "DEPENSE") {
        const seuil = await getSeuil("THRESHOLD_EXPENSE_AUTH");
        if (montant > seuil) {
          return Response.json(
            { error: `Dépense de ${montant} FCFA dépasse le seuil de ${seuil} FCFA. Autorisation MANAGER ou ADMIN requise.` },
            { status: 403 },
          );
        }
      }
    }

    // Resolve caisse
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json({ error: "Aucune caisse active configuree" }, { status: 422 });
    }

    // For RETRAIT/DEPENSE on ESPECES: check sufficient theoretical balance on caisse
    if (isOutflow && mode === "ESPECES") {
      const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
      const soldes = await computeSoldeCaisseParMode(caisse.id);
      const soldeCash = soldes.find((s) => s.mode === "ESPECES")?.solde ?? 0;
      if (montant > soldeCash) {
        return Response.json(
          { error: `Solde espèces insuffisant (disponible: ${soldeCash} FCFA, demandé: ${montant} FCFA)` },
          { status: 422 },
        );
      }
    }

    const mouvement = await createMovement({
      type,
      mode,
      montant: signedMontant,
      caisseId: caisse.id,
      sessionId,
      auteurId: result.user.id,
      motif,
      reference,
      justificatif,
    });

    await logActivity({
      action: ACTIONS.CASH_MOVEMENT_CREATED,
      actorId: result.user.id,
      entityType: "MouvementCaisse",
      entityId: mouvement.id,
      metadata: {
        type,
        mode,
        montant: signedMontant,
        motif,
        sessionId,
        hasJustificatif: !!justificatif,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: mouvement }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/comptoir/movements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
