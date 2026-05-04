import type { TypeMouvementCaisse, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { createMovement, computeSoldeCaisseParMode } from "@/lib/services/cash-movement";
import { getSeuil } from "@/lib/services/seuils";
import { createMouvementCaisseSchema } from "@/lib/validations/mouvement-caisse";

const VALID_TYPES: TypeMouvementCaisse[] = [
  "FOND_INITIAL", "VENTE", "REMBOURSEMENT", "APPORT", "RETRAIT", "DEPENSE", "CORRECTION",
];
const VALID_MODES: string[] = [
  "ESPECES", "MOBILE_MONEY_MTN", "MOBILE_MONEY_MOOV", "CELTIS_CASH",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;
  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const { id: caisseId } = await params;

    const caisse = await prisma.caisse.findUnique({ where: { id: caisseId }, select: { id: true } });
    if (!caisse) {
      return Response.json({ error: "Caisse introuvable" }, { status: 404 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const skip = (page - 1) * limit;

    const typeParam = url.searchParams.get("type");
    const modeParam = url.searchParams.get("mode");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const where: Prisma.MouvementCaisseWhereInput = { caisseId };

    if (typeParam && VALID_TYPES.includes(typeParam as TypeMouvementCaisse)) {
      where.type = typeParam as TypeMouvementCaisse;
    }
    if (modeParam && VALID_MODES.includes(modeParam as string)) {
      where.mode = modeParam as string;
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
          auteur: { select: { id: true, nom: true } },
          vente: { select: { id: true, numero: true } },
        },
      }),
      prisma.mouvementCaisse.count({ where }),
    ]);

    return Response.json({
      data: mouvements,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[GET /api/caisse/[id]/mouvements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const { id: caisseId } = await params;

    const caisse = await prisma.caisse.findUnique({ where: { id: caisseId }, select: { id: true } });
    if (!caisse) {
      return Response.json({ error: "Caisse introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = createMouvementCaisseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { montant, motif, reference, justificatif } = parsed.data;
    const type = parsed.data.type as TypeMouvementCaisse;
    const mode = parsed.data.mode as string;

    const isOutflow = type === "RETRAIT" || type === "DEPENSE";
    const signedMontant = isOutflow ? -montant : montant;

    // Threshold checks for CAISSIER
    if (result.user.role === "CAISSIER") {
      if (type === "RETRAIT") {
        const seuil = await getSeuil("THRESHOLD_CASH_WITHDRAWAL_AUTH");
        if (montant > seuil) {
          return Response.json(
            { error: `Retrait de ${montant} FCFA depasse le seuil de ${seuil} FCFA. Autorisation MANAGER ou ADMIN requise.` },
            { status: 403 },
          );
        }
      }
      if (type === "DEPENSE") {
        const seuil = await getSeuil("THRESHOLD_EXPENSE_AUTH");
        if (montant > seuil) {
          return Response.json(
            { error: `Depense de ${montant} FCFA depasse le seuil de ${seuil} FCFA. Autorisation MANAGER ou ADMIN requise.` },
            { status: 403 },
          );
        }
      }
    }

    // Check sufficient balance for outflows on ESPECES
    if (isOutflow && mode === "ESPECES") {
      const soldes = await computeSoldeCaisseParMode(caisseId);
      const soldeCash = soldes.find((s) => s.mode === "ESPECES")?.solde ?? 0;
      if (montant > soldeCash) {
        return Response.json(
          { error: `Solde especes insuffisant (disponible: ${soldeCash} FCFA, demande: ${montant} FCFA)` },
          { status: 422 },
        );
      }
    }

    const mouvement = await createMovement({
      type,
      mode,
      montant: signedMontant,
      caisseId,
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
      metadata: { type, mode, montant: signedMontant, motif, caisseId, hasJustificatif: !!justificatif },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: mouvement }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/caisse/[id]/mouvements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
