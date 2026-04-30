import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { updateCategorieSchema } from "@/lib/validations/categorie";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const existing = await prisma.categorie.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Catégorie introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateCategorieSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check name uniqueness if changing
    if (parsed.data.nom !== undefined) {
      const conflict = await prisma.categorie.findFirst({
        where: { nom: parsed.data.nom, id: { not: id } },
      });
      if (conflict) {
        return Response.json(
          { error: "Une catégorie avec ce nom existe déjà" },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.nom !== undefined) updateData.nom = parsed.data.nom;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.couleur !== undefined) updateData.couleur = parsed.data.couleur;

    const updated = await prisma.categorie.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { produits: true } } },
    });

    await logActivity({
      action: ACTIONS.CATEGORY_UPDATED,
      actorId: result.user.id,
      entityType: "Category",
      entityId: id,
      metadata: updateData,
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: updated });
  } catch (error) {
    console.error(`[PUT /api/categories/${id}]`, error);
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
    const existing = await prisma.categorie.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Catégorie introuvable" }, { status: 404 });
    }

    // Check if category has products
    const productCount = await prisma.produit.count({
      where: { categorieId: id },
    });
    if (productCount > 0) {
      return Response.json(
        {
          error: `Impossible de supprimer : ${productCount} produit(s) rattaché(s)`,
        },
        { status: 422 }
      );
    }

    await prisma.categorie.delete({ where: { id } });

    await logActivity({
      action: ACTIONS.CATEGORY_DELETED,
      actorId: result.user.id,
      entityType: "Category",
      entityId: id,
      metadata: { nom: existing.nom },
      ipAddress: getClientIp(_req),
      userAgent: getClientUserAgent(_req),
    });

    return Response.json({ message: "Catégorie supprimée" });
  } catch (error) {
    console.error(`[DELETE /api/categories/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
