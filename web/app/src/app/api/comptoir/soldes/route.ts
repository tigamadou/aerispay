import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const url = new URL(req.url);
    const sessionIdParam = url.searchParams.get("sessionId");

    let session: { id: string; statut: string; userId: string; ouvertureAt: Date; user: { id: string; nom: string } } | null = null;

    if (sessionIdParam) {
      session = await prisma.comptoirSession.findUnique({
        where: { id: sessionIdParam },
        select: { id: true, statut: true, userId: true, ouvertureAt: true, user: { select: { id: true, nom: true } } },
      });
    } else {
      session = await prisma.comptoirSession.findFirst({
        where: { userId: result.user.id, statut: "OUVERTE" },
        select: { id: true, statut: true, userId: true, ouvertureAt: true, user: { select: { id: true, nom: true } } },
      });
    }

    if (!session) {
      return Response.json(
        { error: "Aucune session ouverte trouvee" },
        { status: 404 },
      );
    }

    const soldes = await computeSoldeTheoriqueParMode(session.id);
    const total = soldes.reduce((sum, s) => sum + s.solde, 0);

    return Response.json({
      data: {
        session: {
          id: session.id,
          statut: session.statut,
          ouvertureAt: session.ouvertureAt,
          caissier: session.user.nom,
        },
        soldes,
        total,
      },
    });
  } catch (error) {
    console.error("[GET /api/comptoir/soldes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
