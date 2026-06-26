import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const caisseUpdateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = caisseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.caisse.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Caisse introuvable" }, { status: 404 });
    }

    const caisse = await prisma.caisse.update({
      where: { id },
      data: parsed.data,
    });

    await logActivity({
      action: ACTIONS.CAISSE_UPDATED,
      actorId: result.user.id,
      entityType: "Caisse",
      entityId: id,
      metadata: parsed.data,
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: caisse });
  } catch (error) {
    console.error(`[PUT /api/caisse/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const existing = await prisma.caisse.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Caisse introuvable" }, { status: 404 });
    }

    const sessionOuverte = await prisma.comptoirSession.findFirst({
      where: { caisseId: id, statut: "OUVERTE" },
      select: { id: true },
    });
    if (sessionOuverte) {
      return Response.json(
        { error: "Impossible de désactiver une caisse avec une session ouverte" },
        { status: 409 }
      );
    }

    const caisse = await prisma.caisse.update({
      where: { id },
      data: { active: false },
    });

    await logActivity({
      action: ACTIONS.CAISSE_DEACTIVATED,
      actorId: result.user.id,
      entityType: "Caisse",
      entityId: id,
      metadata: { nom: existing.nom },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: caisse });
  } catch (error) {
    console.error(`[DELETE /api/caisse/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
