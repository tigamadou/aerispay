import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

function serializeProduit(p: Record<string, unknown>) {
  return {
    ...p,
    prixAchat: Number(p.prixAchat),
    prixVente: Number(p.prixVente),
    tva: Number(p.tva),
  };
}

export async function GET(_req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    // Fetch all active products and filter for alerts in application layer
    // (Prisma doesn't support column-to-column comparison in where clause)
    const produits = await prisma.produit.findMany({
      where: { actif: true },
      include: { categorie: { select: { id: true, nom: true, couleur: true } } },
      orderBy: { stockActuel: "asc" },
    });

    const alertes = produits
      .filter((p) => p.stockActuel <= 2 * p.stockMinimum)
      .map(serializeProduit);

    return Response.json({ data: alertes });
  } catch (error) {
    console.error("[GET /api/stock/alertes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
