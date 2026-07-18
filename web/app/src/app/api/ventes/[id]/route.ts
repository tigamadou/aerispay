import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

export async function GET(
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

    // IDOR protection: CAISSIER can only see their own sales
    if (result.user.role === "CAISSIER" && vente.userId !== result.user.id) {
      return Response.json({ error: "Acces refuse" }, { status: 403 });
    }

    return Response.json({ data: vente });
  } catch (error) {
    console.error(`[GET /api/ventes/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
