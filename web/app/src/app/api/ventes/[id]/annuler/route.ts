import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const vente = await prisma.vente.findUnique({
      where: { id },
      include: { lignes: true },
    });

    if (!vente) {
      return Response.json({ error: "Vente introuvable" }, { status: 404 });
    }

    if (vente.statut !== "VALIDEE") {
      return Response.json(
        { error: "Seule une vente validée peut être annulée" },
        { status: 422 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Cancel the sale
      const cancelled = await tx.vente.update({
        where: { id },
        data: { statut: "ANNULEE" },
        include: {
          lignes: { include: { produit: { select: { id: true, nom: true, stockActuel: true } } } },
          paiements: true,
          caissier: { select: { id: true, nom: true } },
        },
      });

      // Restore stock for each line
      for (const ligne of cancelled.lignes) {
        const currentStock = ligne.produit.stockActuel;

        await tx.produit.update({
          where: { id: ligne.produitId },
          data: { stockActuel: { increment: ligne.quantite } },
        });

        await tx.mouvementStock.create({
          data: {
            type: "RETOUR",
            quantite: ligne.quantite,
            quantiteAvant: currentStock,
            quantiteApres: currentStock + ligne.quantite,
            motif: `Annulation vente ${vente.numero}`,
            produitId: ligne.produitId,
            venteId: vente.id,
          },
        });
      }

      return cancelled;
    });

    await logActivity({
      action: ACTIONS.SALE_CANCELLED,
      actorId: result.user.id,
      entityType: "Sale",
      entityId: id,
      metadata: { numero: vente.numero, total: Number(vente.total) },
      ipAddress: getClientIp(_req),
      userAgent: getClientUserAgent(_req),
    });

    return Response.json({ data: updated });
  } catch (error) {
    console.error(`[POST /api/ventes/${id}/annuler]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
