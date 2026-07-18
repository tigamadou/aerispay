import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id } = await params;
  try {
    const terminal = await prisma.terminalCaisse.findUnique({ where: { id } });
    if (!terminal) {
      return Response.json({ error: "Terminal introuvable" }, { status: 404 });
    }
    const tokens = await prisma.storeToken.findMany({
      where: { terminalId: id, revoked: false },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ data: tokens });
  } catch (error) {
    console.error(`[GET /api/terminaux/${id}/tokens]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
