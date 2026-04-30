import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";

export async function GET(req: Request) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
  const action = searchParams.get("action");
  const actorId = searchParams.get("actorId");
  const entityType = searchParams.get("entityType");
  const dateDebut = searchParams.get("dateDebut");
  const dateFin = searchParams.get("dateFin");

  try {
    const where: Record<string, unknown> = {};

    if (action) where.action = action;
    if (actorId) where.actorId = actorId;
    if (entityType) where.entityType = entityType;

    if (dateDebut || dateFin) {
      const createdAt: Record<string, Date> = {};
      if (dateDebut) createdAt.gte = new Date(dateDebut);
      if (dateFin) createdAt.lte = new Date(dateFin);
      where.createdAt = createdAt;
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          actor: { select: { id: true, nom: true, email: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return Response.json({ data: logs, total, page, pageSize });
  } catch (error) {
    console.error("[GET /api/activity-logs]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
