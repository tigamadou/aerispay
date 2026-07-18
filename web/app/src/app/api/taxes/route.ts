import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { createTaxeSchema } from "@/lib/validations/taxe";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function GET(_req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const taxes = await prisma.taxe.findMany({
      where: { parametresId: "default" },
      orderBy: { ordre: "asc" },
    });

    return Response.json({ data: taxes });
  } catch (error) {
    console.error("[GET /api/taxes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createTaxeSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const taxe = await prisma.taxe.create({
      data: {
        ...parsed.data,
        parametresId: "default",
      },
    });

    await logActivity({
      action: ACTIONS.TAXE_CREATED,
      actorId: result.user.id,
      entityType: "Taxe",
      entityId: taxe.id,
      metadata: { nom: taxe.nom, taux: Number(taxe.taux) },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: taxe, message: "Taxe creee" }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/taxes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
