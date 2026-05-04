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

    // Date range for last 7 days (for charts — ADMIN/MANAGER only)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [salesAgg, cashAgg, openSession, closedSessions, ...chartData] = await Promise.all([
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
      // KPI-08: Sales last 7 days (ADMIN/MANAGER only)
      ...(!isCaissier
        ? [
            prisma.vente.findMany({
              where: {
                statut: "VALIDEE",
                dateVente: { gte: sevenDaysAgo, lt: endOfToday },
              },
              select: { dateVente: true, total: true },
            }),
            // KPI-09: Top 5 products last 7 days
            prisma.ligneVente.groupBy({
              by: ["produitId"],
              where: {
                vente: {
                  statut: "VALIDEE",
                  dateVente: { gte: sevenDaysAgo, lt: endOfToday },
                },
              },
              _sum: { quantite: true, sousTotal: true },
              orderBy: { _sum: { quantite: "desc" } },
              take: 5,
            }),
          ]
        : [Promise.resolve([]), Promise.resolve([])]),
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

    // Build chart data (ADMIN/MANAGER only)
    const [salesLast7DaysRaw, topProductsRaw] = chartData as [
      Array<{ dateVente: Date; total: Prisma.Decimal | null }>,
      Array<{ produitId: string; _sum: { quantite: number | null; sousTotal: Prisma.Decimal | null } }>,
    ];

    // KPI-08: Aggregate sales by day
    const salesByDay = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      salesByDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const v of salesLast7DaysRaw) {
      const key = new Date(v.dateVente).toISOString().slice(0, 10);
      if (salesByDay.has(key)) {
        salesByDay.set(key, (salesByDay.get(key) ?? 0) + Number(v.total ?? 0));
      }
    }
    const salesLast7Days = Array.from(salesByDay.entries()).map(([date, revenue]) => ({ date, revenue }));

    // KPI-09: Fetch product names for top 5
    let topProducts7Days: Array<{ productId: string; name: string; quantitySold: number; revenueTtc: number }> = [];
    if (topProductsRaw.length > 0) {
      const productIds = topProductsRaw.map((p) => p.produitId);
      const products = await prisma.produit.findMany({
        where: { id: { in: productIds } },
        select: { id: true, nom: true },
      });
      const nameMap = new Map(products.map((p) => [p.id, p.nom]));
      topProducts7Days = topProductsRaw.map((p) => ({
        productId: p.produitId,
        name: nameMap.get(p.produitId) ?? "Inconnu",
        quantitySold: p._sum.quantite ?? 0,
        revenueTtc: Number(p._sum.sousTotal ?? 0),
      }));
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
        ...(!isCaissier && {
          salesLast7Days,
          topProducts7Days,
        }),
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard/kpis]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
