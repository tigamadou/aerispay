import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

/**
 * GET — Consultation des écarts de caisse.
 * MANAGER/ADMIN. Filtres : dateFrom, dateTo, userId, categorie.
 */
export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const userId = searchParams.get("userId");

  try {
    const where: Prisma.ComptoirSessionWhereInput = {
      statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] },
      ecartsParMode: { not: null as unknown as undefined },
    };

    if (userId) where.userId = userId;

    if (dateFrom || dateTo) {
      where.fermetureAt = {};
      if (dateFrom) where.fermetureAt.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        where.fermetureAt.lte = to;
      }
    }

    const sessions = await prisma.comptoirSession.findMany({
      where,
      orderBy: { fermetureAt: "desc" },
      select: {
        id: true,
        statut: true,
        ouvertureAt: true,
        fermetureAt: true,
        ecartsParMode: true,
        userId: true,
        user: { select: { id: true, nom: true } },
      },
    });

    // Filter sessions that have non-zero ecarts and build response
    const discrepancies = sessions
      .map((s) => {
        const ecarts = s.ecartsParMode as Record<string, { ecart: number; categorie: string | null }> | null;
        if (!ecarts) return null;

        const hasNonZero = Object.values(ecarts).some((e) => e.ecart !== 0);
        if (!hasNonZero) return null;

        return {
          sessionId: s.id,
          statut: s.statut,
          ouvertureAt: s.ouvertureAt,
          fermetureAt: s.fermetureAt,
          caissier: s.user,
          ecarts,
        };
      })
      .filter(Boolean);

    return Response.json({ data: discrepancies });
  } catch (error) {
    console.error("[GET /api/comptoir/discrepancies]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
