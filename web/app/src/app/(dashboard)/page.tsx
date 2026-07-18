import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { cn, formatMontant } from "@/lib/utils";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { CaissierDashboard } from "@/components/dashboard/CaissierDashboard";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect("/login");
  }

  const role = user.role as Role;
  const canViewKpis = hasPermission(role, "rapports:consulter");

  if (!canViewKpis) {
    return <CaissierDashboard userName={user.name ?? user.email ?? "Caissier"} />;
  }

  // ADMIN / MANAGER: full KPIs
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [
    allActiveProducts,
    salesToday,
    cashToday,
    closedSessionsToday,
  ] = await Promise.all([
    prisma.produit.findMany({
      where: { actif: true },
      select: {
        id: true,
        nom: true,
        reference: true,
        stockActuel: true,
        stockMinimum: true,
        prixVente: true,
        image: true,
        categorie: { select: { nom: true, couleur: true } },
      },
      orderBy: { stockActuel: "asc" },
    }),
    prisma.vente.aggregate({
      where: { statut: "VALIDEE", dateVente: { gte: startOfDay, lt: endOfDay } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.paiement.aggregate({
      where: {
        mode: "ESPECES",
        vente: { statut: "VALIDEE", dateVente: { gte: startOfDay, lt: endOfDay } },
      },
      _sum: { montant: true },
    }),
    prisma.comptoirSession.findMany({
      where: {
        statut: { in: ["FERMEE", "VALIDEE", "FORCEE", "CORRIGEE"] },
        fermetureAt: { gte: startOfDay, lt: endOfDay },
      },
      select: {
        id: true,
        ouvertureAt: true,
        fermetureAt: true,
        ecartCash: true,
        ecartMobileMoney: true,
        montantFermetureCash: true,
        montantFermetureMobileMoney: true,
        soldeTheoriqueCash: true,
        soldeTheoriqueMobileMoney: true,
        statut: true,
        user: { select: { nom: true } },
      },
    }),
  ]);

  const revenueDay = Number(salesToday._sum.total ?? 0);
  const salesCount = salesToday._count;
  const averageBasket = salesCount > 0 ? revenueDay / salesCount : 0;
  const cashTotal = Number(cashToday._sum.montant ?? 0);
  const nonCashTotal = revenueDay - cashTotal;

  // Cash discrepancy KPIs
  let totalExcedent = 0;
  let totalManquant = 0;
  let discrepancyCount = 0;
  for (const s of closedSessionsToday) {
    const ecart = Number(s.ecartCash ?? 0) + Number(s.ecartMobileMoney ?? 0);
    if (ecart > 0) {
      totalExcedent += ecart;
      discrepancyCount++;
    } else if (ecart < 0) {
      totalManquant += Math.abs(ecart);
      discrepancyCount++;
    }
  }

  const alertProducts = allActiveProducts.filter(
    (p) => p.stockActuel > p.stockMinimum && p.stockActuel <= 2 * p.stockMinimum
  );
  const ruptureProducts = allActiveProducts.filter(
    (p) => p.stockActuel <= p.stockMinimum
  );
  const top5Lowest = allActiveProducts.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Tableau de bord
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="CA du jour" value={formatMontant(revenueDay)} />
        <KpiCard label="Ventes du jour" value={String(salesCount)} />
        <KpiCard label="Panier moyen" value={salesCount > 0 ? formatMontant(averageBasket) : "N/A"} />
        <KpiCard label="Espèces" value={formatMontant(cashTotal)} sub={`Autres: ${formatMontant(nonCashTotal)}`} />
      </div>

      {/* Charts: CA 7 jours + Top 5 produits */}
      <DashboardCharts />

      {/* Stock alerts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/stock?statut=alerte" className="group">
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 transition-shadow group-hover:shadow-md dark:border-orange-800 dark:bg-orange-900/10">
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Produits en alerte</p>
            <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{alertProducts.length}</p>
            <p className="text-xs text-orange-500">Stock bas — cliquer pour voir</p>
          </div>
        </Link>
        <Link href="/stock?statut=rupture" className="group">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 transition-shadow group-hover:shadow-md dark:border-red-800 dark:bg-red-900/10">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Produits en rupture</p>
            <p className="text-3xl font-bold text-red-700 dark:text-red-300">{ruptureProducts.length}</p>
            <p className="text-xs text-red-500">Stock critique — cliquer pour voir</p>
          </div>
        </Link>
      </div>

      {/* Cash discrepancy */}
      {closedSessionsToday.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Ecarts de caisse du jour
            </h2>
            <Link
              href="/comptoir/ecarts"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Voir tout l&apos;historique
            </Link>
          </div>

          {/* Summary cards */}
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sessions fermees</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{closedSessionsToday.length}</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {discrepancyCount > 0 ? `${discrepancyCount} avec ecart` : "Aucun ecart"}
              </p>
            </div>
            <div className={cn(
              "rounded-xl border p-4",
              totalExcedent > 0
                ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            )}>
              <p className={cn("text-xs font-medium", totalExcedent > 0 ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400")}>
                Excedent total
              </p>
              <p className={cn("mt-1 text-2xl font-bold", totalExcedent > 0 ? "text-blue-700 dark:text-blue-300" : "text-zinc-900 dark:text-zinc-100")}>
                +{formatMontant(totalExcedent)}
              </p>
            </div>
            <div className={cn(
              "rounded-xl border p-4",
              totalManquant > 0
                ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            )}>
              <p className={cn("text-xs font-medium", totalManquant > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400")}>
                Manquant total
              </p>
              <p className={cn("mt-1 text-2xl font-bold", totalManquant > 0 ? "text-red-700 dark:text-red-300" : "text-zinc-900 dark:text-zinc-100")}>
                -{formatMontant(totalManquant)}
              </p>
            </div>
          </div>

          {/* Detail per session */}
          {discrepancyCount > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Caissier</th>
                    <th className="px-4 py-2.5 font-medium">Horaires</th>
                    <th className="px-4 py-2.5 font-medium text-right">Attendu</th>
                    <th className="px-4 py-2.5 font-medium text-right">Compte</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ecart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {closedSessionsToday.map((s) => {
                    const ecartTotal = Number(s.ecartCash ?? 0) + Number(s.ecartMobileMoney ?? 0);
                    if (ecartTotal === 0) return null;
                    const attenduTotal = Number(s.soldeTheoriqueCash ?? 0) + Number(s.soldeTheoriqueMobileMoney ?? 0);
                    const compteTotal = Number(s.montantFermetureCash ?? 0) + Number(s.montantFermetureMobileMoney ?? 0);
                    return (
                      <tr key={s.id} className="text-zinc-700 dark:text-zinc-300">
                        <td className="px-4 py-2.5 font-medium">{s.user.nom}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-500">
                          {s.ouvertureAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          {" — "}
                          {s.fermetureAt?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) ?? "?"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMontant(attenduTotal)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMontant(compteTotal)}</td>
                        <td className={cn(
                          "px-4 py-2.5 text-right font-bold tabular-nums",
                          ecartTotal > 0 ? "text-blue-600" : "text-red-600"
                        )}>
                          {ecartTotal > 0 ? "+" : ""}{formatMontant(ecartTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Top 5 lowest stock */}
      {top5Lowest.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Stocks les plus bas
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 font-medium">Catégorie</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                  <th className="px-4 py-2.5 font-medium text-right">Seuil min.</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {top5Lowest.map((p) => {
                  let statusLabel: string;
                  let statusClasses: string;
                  if (p.stockActuel === 0) {
                    statusLabel = "Épuisé";
                    statusClasses = "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300";
                  } else if (p.stockActuel <= p.stockMinimum) {
                    statusLabel = "Rupture";
                    statusClasses = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
                  } else if (p.stockActuel <= 2 * p.stockMinimum) {
                    statusLabel = "Alerte";
                    statusClasses = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
                  } else {
                    statusLabel = "Normal";
                    statusClasses = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
                  }
                  return (
                    <tr key={p.id} className="text-zinc-700 dark:text-zinc-300">
                      <td className="px-4 py-2.5">
                        <Link href={`/stock/${p.id}`} className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400">
                          {p.nom}
                        </Link>
                        <span className="ml-1 text-xs text-zinc-400">{p.reference}</span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{p.categorie.nom}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{p.stockActuel}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{p.stockMinimum}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}
