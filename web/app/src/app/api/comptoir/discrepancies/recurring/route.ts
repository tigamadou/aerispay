import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { getSeuil } from "@/lib/services/seuils";

/**
 * GET — RULE-DISCREPANCY-001: Recurring discrepancies per cashier.
 * Returns cashiers who have >= THRESHOLD_RECURRING_COUNT discrepancies
 * within the last THRESHOLD_RECURRING_PERIOD_DAYS days.
 * MANAGER/ADMIN only.
 */
export async function GET(_req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const recurringCount = await getSeuil("THRESHOLD_RECURRING_COUNT");
    const periodDays = await getSeuil("THRESHOLD_RECURRING_PERIOD_DAYS");

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - periodDays);

    // Find all closed sessions with ecarts in the period
    const sessions = await prisma.comptoirSession.findMany({
      where: {
        statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] },
        fermetureAt: { gte: sinceDate },
        ecartsParMode: { not: null as unknown as undefined },
      },
      select: {
        id: true,
        userId: true,
        fermetureAt: true,
        ecartsParMode: true,
        user: { select: { id: true, nom: true, email: true } },
      },
    });

    // Count discrepancies per user
    const userDiscrepancies = new Map<string, {
      user: { id: string; nom: string; email: string };
      count: number;
      sessions: Array<{ sessionId: string; fermetureAt: Date | null; ecarts: Record<string, unknown> }>;
    }>();

    for (const s of sessions) {
      const ecarts = s.ecartsParMode as Record<string, { ecart: number }> | null;
      if (!ecarts) continue;

      const hasNonZero = Object.values(ecarts).some((e) => e.ecart !== 0);
      if (!hasNonZero) continue;

      let entry = userDiscrepancies.get(s.userId);
      if (!entry) {
        entry = { user: s.user, count: 0, sessions: [] };
        userDiscrepancies.set(s.userId, entry);
      }
      entry.count++;
      entry.sessions.push({
        sessionId: s.id,
        fermetureAt: s.fermetureAt,
        ecarts,
      });
    }

    // Filter to those at or above threshold
    const recurring = Array.from(userDiscrepancies.values())
      .filter((e) => e.count >= recurringCount)
      .sort((a, b) => b.count - a.count);

    return Response.json({
      data: {
        seuils: { recurringCount, periodDays },
        caissiers: recurring,
      },
    });
  } catch (error) {
    console.error("[GET /api/comptoir/discrepancies/recurring]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
