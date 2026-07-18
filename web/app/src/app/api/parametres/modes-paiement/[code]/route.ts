import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { z } from "zod";

const updateModeSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
  ordre: z.number().int().min(0).optional(),
}).refine(
  (data) => data.label !== undefined || data.active !== undefined || data.ordre !== undefined,
  { message: "Au moins un champ a modifier (label, active, ordre)" },
);

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const { code } = await params;

    const existing = await prisma.modePaiementConfig.findUnique({ where: { code } });
    if (!existing) {
      return Response.json({ error: "Mode de paiement introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateModeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
    if (parsed.data.ordre !== undefined) updateData.ordre = parsed.data.ordre;

    const updated = await prisma.modePaiementConfig.update({
      where: { code },
      data: updateData,
    });

    await logActivity({
      action: ACTIONS.MODE_PAIEMENT_UPDATED,
      actorId: result.user.id,
      entityType: "ModePaiementConfig",
      entityId: updated.id,
      metadata: { code, changes: parsed.data },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: updated });
  } catch (error) {
    console.error("[PUT /api/parametres/modes-paiement/[code]]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const { code } = await params;

    const existing = await prisma.modePaiementConfig.findUnique({ where: { code } });
    if (!existing) {
      return Response.json({ error: "Mode de paiement introuvable" }, { status: 404 });
    }

    await prisma.modePaiementConfig.delete({ where: { code } });

    await logActivity({
      action: ACTIONS.MODE_PAIEMENT_DELETED,
      actorId: result.user.id,
      entityType: "ModePaiementConfig",
      entityId: existing.id,
      metadata: { code, label: existing.label },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: { deleted: true, code } });
  } catch (error) {
    console.error("[DELETE /api/parametres/modes-paiement/[code]]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
