import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { createMouvementSchema } from "@/lib/validations/mouvement";
import type { TypeMouvement } from "@prisma/client";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function GET(req: Request) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
  const produitId = searchParams.get("produitId");
  const type = searchParams.get("type");
  const dateDebut = searchParams.get("dateDebut");
  const dateFin = searchParams.get("dateFin");

  try {
    const where: Record<string, unknown> = {};

    if (produitId) where.produitId = produitId;
    if (type) where.type = type as TypeMouvement;

    if (dateDebut || dateFin) {
      const createdAt: Record<string, Date> = {};
      if (dateDebut) createdAt.gte = new Date(dateDebut);
      if (dateFin) createdAt.lte = new Date(dateFin);
      where.createdAt = createdAt;
    }

    const [mouvements, total] = await Promise.all([
      prisma.mouvementStock.findMany({
        where,
        include: {
          produit: { select: { id: true, nom: true, reference: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.mouvementStock.count({ where }),
    ]);

    return Response.json({ data: mouvements, total, page, pageSize });
  } catch (error) {
    console.error("[GET /api/stock/mouvements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createMouvementSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { produitId, type, quantite, motif, reference } = parsed.data;

    const mouvement = await prisma.$transaction(async (tx) => {
      const produit = await tx.produit.findUnique({
        where: { id: produitId },
      });

      if (!produit) {
        throw { status: 404, message: "Produit introuvable" };
      }

      const stockAvant = produit.stockActuel;
      let stockApres: number;

      switch (type) {
        case "ENTREE":
          stockApres = stockAvant + quantite;
          break;
        case "SORTIE":
        case "PERTE":
          if (quantite > stockAvant) {
            throw {
              status: 422,
              message: `Stock insuffisant (disponible : ${stockAvant}, demandé : ${quantite})`,
            };
          }
          stockApres = stockAvant - quantite;
          break;
        case "AJUSTEMENT":
          // Ajustement: quantity is the new absolute stock level
          stockApres = quantite;
          break;
        default:
          throw { status: 400, message: "Type de mouvement invalide" };
      }

      await tx.produit.update({
        where: { id: produitId },
        data: { stockActuel: stockApres },
      });

      return tx.mouvementStock.create({
        data: {
          type,
          quantite,
          quantiteAvant: stockAvant,
          quantiteApres: stockApres,
          motif: motif ?? null,
          reference: reference ?? null,
          produitId,
        },
        include: {
          produit: { select: { id: true, nom: true, reference: true } },
        },
      });
    });

    await logActivity({
      action: ACTIONS.STOCK_MOVEMENT_CREATED,
      actorId: result.user.id,
      entityType: "StockMovement",
      entityId: mouvement.id,
      metadata: {
        type,
        quantite,
        produitId,
        produitNom: mouvement.produit.nom,
        quantiteAvant: mouvement.quantiteAvant,
        quantiteApres: mouvement.quantiteApres,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: mouvement }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      "message" in error
    ) {
      const e = error as { status: number; message: string };
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/stock/mouvements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
