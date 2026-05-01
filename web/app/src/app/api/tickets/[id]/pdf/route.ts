import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { generateReceiptPDF } from "@/lib/receipt/pdf-generator";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const vente = await prisma.vente.findUnique({
      where: { id },
      include: {
        lignes: {
          include: { produit: { select: { id: true, nom: true, reference: true } } },
        },
        paiements: true,
        caissier: { select: { id: true, nom: true, email: true } },
        session: { select: { id: true, ouvertureAt: true } },
      },
    });

    if (!vente) {
      return Response.json({ error: "Vente introuvable" }, { status: 404 });
    }

    const parametres = await prisma.parametres.findUnique({ where: { id: "default" } });

    const business = {
      name: parametres?.nomCommerce || "AerisPay",
      address: parametres?.adresse ?? "",
      phone: parametres?.telephone ?? "",
      email: parametres?.email ?? "",
      rccm: parametres?.rccm ?? "",
      nif: parametres?.nif ?? "",
      logo: parametres?.logo ?? null,
    };

    const pdfBuffer = await generateReceiptPDF({ sale: vente, business });

    await logActivity({
      action: ACTIONS.TICKET_PDF_DOWNLOADED,
      actorId: result.user.id,
      entityType: "Sale",
      entityId: id,
      metadata: {
        numero: vente.numero,
        total: Number(vente.total),
        dateVente: vente.dateVente.toISOString(),
        caissierNom: vente.caissier.nom,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ticket-${vente.numero}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error(`[GET /api/tickets/${id}/pdf]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
