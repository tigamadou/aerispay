import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { createMovementInTx } from "@/lib/services/cash-movement";

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
      include: { lignes: true, paiements: true },
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

    // P0-005: Resolve caisse with early return if none active
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json({ error: "Aucune caisse active configuree" }, { status: 422 });
    }
    const caisseId = caisse.id;

    // P0-003: Verify session is still open
    const session = await prisma.comptoirSession.findUnique({
      where: { id: vente.sessionId },
      select: { id: true, statut: true },
    });

    if (!session || session.statut !== "OUVERTE") {
      return Response.json(
        { error: "Impossible d'annuler une vente dont la session est fermee" },
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

      // P0-002: RULE-MVT-003 : mouvement REMBOURSEMENT (négatif) par paiement
      // Cap each refund to the sale total (like POST /api/ventes L234-255)
      const totalNum = Number(vente.total);
      let remainingTotal = totalNum;
      for (const paiement of cancelled.paiements) {
        const paiementMontant = Math.min(Math.abs(Number(paiement.montant)), remainingTotal);
        if (paiementMontant > 0) {
          await createMovementInTx(tx, {
            type: "REMBOURSEMENT",
            mode: paiement.mode,
            montant: -paiementMontant,
            caisseId,
            sessionId: vente.sessionId,
            auteurId: result.user.id,
            venteId: vente.id,
            motif: `Annulation vente ${vente.numero}`,
            reference: paiement.reference ?? undefined,
          });
          remainingTotal -= paiementMontant;
        }
      }

      return cancelled;
    });

    await logActivity({
      action: ACTIONS.SALE_CANCELLED,
      actorId: result.user.id,
      entityType: "Sale",
      entityId: id,
      metadata: {
        numero: vente.numero,
        total: Number(vente.total),
        sousTotal: Number(vente.sousTotal),
        remise: Number(vente.remise),
        tva: Number(vente.tva),
        nbArticlesRestaures: vente.lignes.reduce((sum, l) => sum + l.quantite, 0),
        sessionId: vente.sessionId,
        dateVente: vente.dateVente.toISOString(),
      },
      ipAddress: getClientIp(_req),
      userAgent: getClientUserAgent(_req),
    });

    return Response.json({ data: updated });
  } catch (error) {
    console.error(`[POST /api/ventes/${id}/annuler]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
