import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { getPrinterConfig, getCashDrawerConfig } from "@/lib/receipt/thermal-printer";
import type { Prisma } from "@prisma/client";

type Period = "day" | "week" | "month" | "custom";

function getDateRange(period: Period, dateFrom?: string, dateTo?: string): { gte: Date; lt: Date } {
  const now = new Date();

  if (period === "custom" && dateFrom) {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    const to = dateTo ? new Date(dateTo) : new Date();
    to.setHours(23, 59, 59, 999);
    return { gte: from, lt: new Date(to.getTime() + 1) };
  }

  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { gte: start, lt: end };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { gte: start, lt: end };
  }

  // day (default)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { gte: startOfDay, lt: endOfDay };
}

export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;

  let period: Period = "day";
  const periodParam = searchParams.get("period");
  if (periodParam === "week" || periodParam === "month") {
    period = periodParam;
  } else if (dateFrom) {
    period = "custom";
  }

  const isCaissier = result.user.role === "CAISSIER";
  const dateRange = getDateRange(period, dateFrom, dateTo);

  try {
    const venteWhere: Prisma.VenteWhereInput = {
      statut: "VALIDEE",
      dateVente: dateRange,
      ...(isCaissier ? { userId: result.user.id } : {}),
    };

    const sessionWhere = {
      statut: "FERMEE" as const,
      fermetureAt: dateRange,
      ...(isCaissier ? { userId: result.user.id } : {}),
    };

    const [salesAgg, cashAgg, openSession, closedSessions] = await Promise.all([
      prisma.vente.aggregate({
        where: venteWhere,
        _sum: { total: true },
        _count: true,
      }),
      prisma.paiement.aggregate({
        where: {
          mode: "ESPECES",
          vente: venteWhere,
        },
        _sum: { montant: true },
      }),
      prisma.comptoirSession.findFirst({
        where: { userId: result.user.id, statut: "OUVERTE" },
        select: { id: true, ouvertureAt: true, montantOuvertureCash: true, montantOuvertureMobileMoney: true },
      }),
      prisma.comptoirSession.findMany({
        where: sessionWhere,
        select: { id: true, ecartCash: true, ecartMobileMoney: true, userId: true },
      }),
    ]);

    const revenue = Number(salesAgg._sum.total ?? 0);
    const salesCount = salesAgg._count;
    const averageBasket = salesCount > 0 ? Math.round(revenue / salesCount) : 0;
    const cashTotal = Number(cashAgg._sum.montant ?? 0);
    const nonCashTotal = Math.max(0, revenue - cashTotal);

    // Cash discrepancy KPIs (cash + mobile money combined)
    let totalExcedent = 0;
    let totalManquant = 0;
    let discrepancyCount = 0;
    for (const s of closedSessions) {
      const ecartTotal = Number(s.ecartCash ?? 0) + Number(s.ecartMobileMoney ?? 0);
      if (ecartTotal > 0) {
        totalExcedent += ecartTotal;
        discrepancyCount++;
      } else if (ecartTotal < 0) {
        totalManquant += Math.abs(ecartTotal);
        discrepancyCount++;
      }
    }

    // Peripheral status
    const printerConfig = getPrinterConfig();
    const drawerConfig = getCashDrawerConfig();

    return Response.json({
      data: {
        period,
        dateFrom: dateRange.gte.toISOString(),
        dateTo: new Date(dateRange.lt.getTime() - 1).toISOString(),
        revenue,
        salesCount,
        averageBasket,
        cashTotal,
        nonCashTotal,
        openSession: openSession
          ? {
              id: openSession.id,
              ouvertureAt: openSession.ouvertureAt.toISOString(),
              montantOuvertureCash: Number(openSession.montantOuvertureCash),
              montantOuvertureMobileMoney: Number(openSession.montantOuvertureMobileMoney),
            }
          : null,
        cashDiscrepancy: {
          sessionsCount: closedSessions.length,
          discrepancyCount,
          totalExcedent,
          totalManquant,
        },
        peripherals: {
          printer: {
            enabled: printerConfig.enabled,
            type: printerConfig.type,
            interface: printerConfig.interface,
          },
          cashDrawer: {
            enabled: drawerConfig.enabled,
            mode: drawerConfig.mode,
          },
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard/kpis]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
