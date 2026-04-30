import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { updateProductSchema } from "@/lib/validations/produit";

function serializeProduit(p: Record<string, unknown>) {
  return {
    ...p,
    prixAchat: Number(p.prixAchat),
    prixVente: Number(p.prixVente),
    tva: Number(p.tva),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const produit = await prisma.produit.findUnique({
      where: { id },
      include: {
        categorie: { select: { id: true, nom: true, couleur: true } },
        mouvements: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!produit) {
      return Response.json({ error: "Produit introuvable" }, { status: 404 });
    }

    return Response.json({ data: serializeProduit(produit) });
  } catch (error) {
    console.error(`[GET /api/produits/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const existing = await prisma.produit.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Produit introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // If updating prices, validate salePrice > purchasePrice with existing values
    const newPrixVente = parsed.data.prixVente ?? Number(existing.prixVente);
    const newPrixAchat = parsed.data.prixAchat ?? Number(existing.prixAchat);
    if (newPrixVente <= newPrixAchat) {
      return Response.json(
        { error: "Le prix de vente doit être supérieur au prix d'achat" },
        { status: 400 }
      );
    }

    // Check barcode uniqueness if changing
    if (parsed.data.codeBarres !== undefined && parsed.data.codeBarres !== null) {
      const barcodeConflict = await prisma.produit.findUnique({
        where: { codeBarres: parsed.data.codeBarres },
      });
      if (barcodeConflict && barcodeConflict.id !== id) {
        return Response.json(
          { error: "Un produit avec ce code-barres existe déjà" },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.nom !== undefined) updateData.nom = parsed.data.nom;
    if (parsed.data.codeBarres !== undefined) updateData.codeBarres = parsed.data.codeBarres;
    if (parsed.data.categorieId !== undefined) updateData.categorieId = parsed.data.categorieId;
    if (parsed.data.prixAchat !== undefined) updateData.prixAchat = parsed.data.prixAchat;
    if (parsed.data.prixVente !== undefined) updateData.prixVente = parsed.data.prixVente;
    if (parsed.data.tva !== undefined) updateData.tva = parsed.data.tva;
    if (parsed.data.unite !== undefined) updateData.unite = parsed.data.unite;
    if (parsed.data.stockMinimum !== undefined) updateData.stockMinimum = parsed.data.stockMinimum;
    if (parsed.data.stockMaximum !== undefined) updateData.stockMaximum = parsed.data.stockMaximum;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.image !== undefined) updateData.image = parsed.data.image;
    if (parsed.data.actif !== undefined) updateData.actif = parsed.data.actif;

    const updated = await prisma.produit.update({
      where: { id },
      data: updateData,
      include: { categorie: { select: { id: true, nom: true, couleur: true } } },
    });

    return Response.json({ data: serializeProduit(updated) });
  } catch (error) {
    console.error(`[PUT /api/produits/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const existing = await prisma.produit.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Produit introuvable" }, { status: 404 });
    }

    const updated = await prisma.produit.update({
      where: { id },
      data: { actif: false },
    });

    return Response.json({
      data: serializeProduit(updated),
      message: "Produit désactivé",
    });
  } catch (error) {
    console.error(`[DELETE /api/produits/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
