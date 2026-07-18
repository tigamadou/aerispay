import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { createCategorieSchema } from "@/lib/validations/categorie";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function GET(_req: Request): Promise<Response> {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const categories = await prisma.categorie.findMany({
      include: { _count: { select: { produits: true } } },
      orderBy: { nom: "asc" },
    });

    return Response.json({ data: categories });
  } catch (error) {
    console.error("[GET /api/categories]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createCategorieSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check name uniqueness
    const existing = await prisma.categorie.findFirst({
      where: { nom: parsed.data.nom },
    });
    if (existing) {
      return Response.json(
        { error: "Une catégorie avec ce nom existe déjà" },
        { status: 409 }
      );
    }

    const categorie = await prisma.categorie.create({
      data: {
        nom: parsed.data.nom,
        description: parsed.data.description ?? null,
        couleur: parsed.data.couleur ?? null,
      },
      include: { _count: { select: { produits: true } } },
    });

    await logActivity({
      action: ACTIONS.CATEGORY_CREATED,
      actorId: result.user.id,
      entityType: "Category",
      entityId: categorie.id,
      metadata: {
        nom: categorie.nom,
        description: categorie.description,
        couleur: categorie.couleur,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: categorie }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/categories]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
