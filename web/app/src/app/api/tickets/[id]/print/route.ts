import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { printReceipt, getPrinterConfig } from "@/lib/receipt/thermal-printer";
import { buildReceiptContent, type ReceiptContentData } from "@/lib/receipt/receipt-content";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const vente = await prisma.vente.findUnique({
      where: { id },
      include: {
        lignes: { include: { produit: { select: { nom: true } } } },
        paiements: true,
        caissier: { select: { nom: true } },
      },
    });
    if (!vente) {
      return Response.json({ error: "Vente introuvable" }, { status: 404 });
    }

    const parametres = await prisma.parametres.findUnique({ where: { id: "default" } });

    // C2.1 — contenu réel du ticket à partir des données de la vente
    const taxesDetail = Array.isArray(vente.taxesDetail)
      ? (vente.taxesDetail as unknown as ReceiptContentData["sale"]["taxesDetail"])
      : null;
    const content: ReceiptContentData = {
      business: {
        name: parametres?.nomCommerce ?? "",
        address: parametres?.adresse ?? undefined,
        phone: parametres?.telephone ?? undefined,
        rccm: parametres?.rccm ?? undefined,
        nif: parametres?.nif ?? undefined,
      },
      sale: {
        numero: vente.numero,
        dateVente: vente.dateVente,
        caissierNom: vente.caissier.nom,
        lignes: vente.lignes.map((l) => ({
          nom: l.produit.nom,
          quantite: l.quantite,
          prixUnitaire: Number(l.prixUnitaire),
          sousTotal: Number(l.sousTotal),
        })),
        sousTotal: Number(vente.sousTotal),
        remise: Number(vente.remise),
        taxesDetail,
        total: Number(vente.total),
        paiements: vente.paiements.map((p) => ({ mode: p.mode, montant: Number(p.montant) })),
      },
    };
    const lines = buildReceiptContent(content, getPrinterConfig().width);
    const printResult = await printReceipt(id, { lines });

    await logActivity({
      action: ACTIONS.TICKET_THERMAL_PRINT_REQUESTED,
      actorId: result.user.id,
      entityType: "Sale",
      entityId: id,
      metadata: { numero: vente.numero, success: printResult.success, message: printResult.message },
      ipAddress: getClientIp(_req),
      userAgent: getClientUserAgent(_req),
    });

    if (!printResult.success) {
      return Response.json(
        { success: false, error: printResult.message },
        { status: 503 }
      );
    }

    return Response.json({ success: true, message: printResult.message });
  } catch (error) {
    console.error(`[POST /api/tickets/${id}/print]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
