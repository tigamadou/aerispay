import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { updateTaxeSchema } from "@/lib/validations/taxe";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateTaxeSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const taxe = await prisma.taxe.update({
      where: { id },
      data: parsed.data,
    });

    await logActivity({
      action: ACTIONS.TAXE_UPDATED,
      actorId: result.user.id,
      entityType: "Taxe",
      entityId: taxe.id,
      metadata: { nom: taxe.nom, taux: Number(taxe.taux) },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: taxe, message: "Taxe mise a jour" });
  } catch (error) {
    console.error("[PUT /api/taxes/[id]]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const { id } = await params;
    const taxe = await prisma.taxe.delete({ where: { id } });

    await logActivity({
      action: ACTIONS.TAXE_DELETED,
      actorId: result.user.id,
      entityType: "Taxe",
      entityId: id,
      metadata: { nom: taxe.nom },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ message: "Taxe supprimee" });
  } catch (error) {
    console.error("[DELETE /api/taxes/[id]]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
