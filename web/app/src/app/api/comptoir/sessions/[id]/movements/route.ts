import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { listMovements } from "@/lib/services/cash-movement";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    const mouvements = await listMovements(id);

    return Response.json({ data: mouvements });
  } catch (error) {
    console.error(`[GET /api/comptoir/sessions/${id}/movements]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
