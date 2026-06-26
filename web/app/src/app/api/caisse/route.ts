import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, hasPermission, requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const caisseSchema = z.object({
  nom: z.string().min(1).max(100),
  active: z.boolean().optional(),
});

export async function GET() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;
  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const caisses = await prisma.caisse.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });

    return Response.json({ data: caisses });
  } catch (error) {
    console.error("[GET /api/caisse]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = caisseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const caisse = await prisma.caisse.create({
      data: { nom: parsed.data.nom, active: parsed.data.active ?? true },
    });

    await logActivity({
      action: ACTIONS.CAISSE_CREATED,
      actorId: result.user.id,
      entityType: "Caisse",
      entityId: caisse.id,
      metadata: { nom: caisse.nom },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: caisse }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/caisse]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
