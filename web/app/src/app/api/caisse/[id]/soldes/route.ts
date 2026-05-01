import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;
  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const caisse = await prisma.caisse.findUnique({
      where: { id },
      select: { id: true, nom: true, active: true },
    });

    if (!caisse) {
      return Response.json({ error: "Caisse introuvable" }, { status: 404 });
    }

    const soldes = await computeSoldeCaisseParMode(caisse.id);
    const total = soldes.reduce((sum, s) => sum + s.solde, 0);

    return Response.json({
      data: {
        caisse: { id: caisse.id, nom: caisse.nom },
        soldes,
        total,
      },
    });
  } catch (error) {
    console.error("[GET /api/caisse/[id]/soldes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
