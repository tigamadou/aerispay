import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { createMouvementSchema } from "@/lib/validations/mouvement";
import type { TypeMouvement } from "@prisma/client";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

class TxError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TxError";
    this.status = status;
  }
}

export async function GET(req: Request): Promise<Response> {
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

export async function POST(req: Request): Promise<Response> {
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
        throw new TxError("Produit introuvable", 404);
      }

      const stockAvant = produit.stockActuel;
      let stockApres: number;

      switch (type) {
        case "ENTREE":
          stockApres = stockAvant + quantite;
          await tx.produit.update({
            where: { id: produitId },
            data: { stockActuel: { increment: quantite } },
          });
          break;
        case "SORTIE":
        case "PERTE": {
          // Lot B (C3) : décrément conditionnel atomique — pas de stock négatif sous concurrence.
          const { count } = await tx.produit.updateMany({
            where: { id: produitId, stockActuel: { gte: quantite } },
            data: { stockActuel: { decrement: quantite } },
          });
          if (count === 0) {
            throw new TxError(
              `Stock insuffisant (disponible : ${stockAvant}, demandé : ${quantite})`,
              422,
            );
          }
          stockApres = stockAvant - quantite;
          break;
        }
        case "AJUSTEMENT": {
          // Lot B (C3) : valeur absolue → verrou de ligne (FOR UPDATE) avant lecture/écriture
          // pour éviter le lost update entre deux ajustements concurrents.
          const locked = await tx.$queryRaw<{ stockActuel: number }[]>`
            SELECT stockActuel FROM produits WHERE id = ${produitId} FOR UPDATE
          `;
          const stockVerrouille = locked[0]?.stockActuel ?? stockAvant;
          stockApres = quantite;
          await tx.produit.update({
            where: { id: produitId },
            data: { stockActuel: stockApres },
          });
          // quantiteAvant reflète la valeur verrouillée au moment de l'écriture
          return tx.mouvementStock.create({
            data: {
              type,
              quantite,
              quantiteAvant: stockVerrouille,
              quantiteApres: stockApres,
              motif: motif ?? null,
              reference: reference ?? null,
              produitId,
            },
            include: {
              produit: { select: { id: true, nom: true, reference: true } },
            },
          });
        }
        default:
          throw new TxError("Type de mouvement invalide", 400);
      }

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
    if (error instanceof TxError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/stock/mouvements]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
