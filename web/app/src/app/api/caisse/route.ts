import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";

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
