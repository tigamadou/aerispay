import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { cn, formatMontant } from "@/lib/utils";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ecarts de caisse — AerisPay",
};

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
}

export default async function EcartsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  if (!hasPermission(role, "rapports:consulter")) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Acces refuse</p>
      </div>
    );
  }

  const params = await searchParams;
  const dateFrom = params.dateFrom ?? "";
  const dateTo = params.dateTo ?? "";
  const filterUserId = params.userId ?? "";

  // Build Prisma where — fetch all closed sessions that have ecart fields set
  const where: Prisma.ComptoirSessionWhereInput = {
    statut: { in: ["FERMEE", "VALIDEE", "FORCEE", "CORRIGEE"] },
    ecartCash: { not: null },
  };

  if (dateFrom || dateTo) {
    const dateFilter: Prisma.DateTimeNullableFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    where.fermetureAt = dateFilter;
  }

  if (filterUserId) {
    where.userId = filterUserId;
  }

  const [allClosed, allUsers] = await Promise.all([
    prisma.comptoirSession.findMany({
      where,
      orderBy: { fermetureAt: "desc" },
      take: 200,
      select: {
        id: true,
        statut: true,
        ouvertureAt: true,
        fermetureAt: true,
        montantOuvertureCash: true,
        montantOuvertureMobileMoney: true,
        montantFermetureCash: true,
        montantFermetureMobileMoney: true,
        soldeTheoriqueCash: true,
        soldeTheoriqueMobileMoney: true,
        ecartCash: true,
        ecartMobileMoney: true,
        notes: true,
        user: { select: { id: true, nom: true } },
      },
    }),
    prisma.user.findMany({
      where: { actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  // Filter in JS: only sessions with non-zero ecarts
  const sessionsWithEcarts = allClosed.filter((s) => {
    const eCash = Math.abs(Number(s.ecartCash ?? 0));
    const eMM = Math.abs(Number(s.ecartMobileMoney ?? 0));
    return eCash > 0.01 || eMM > 0.01;
  });

  // Totals
  let totalExcedent = 0;
  let totalManquant = 0;
  for (const s of sessionsWithEcarts) {
    const ecart = Number(s.ecartCash ?? 0) + Number(s.ecartMobileMoney ?? 0);
    if (ecart > 0) totalExcedent += ecart;
    else if (ecart < 0) totalManquant += Math.abs(ecart);
  }

  const statutLabel: Record<string, string> = {
    FERMEE: "Fermee",
    VALIDEE: "Validee",
    FORCEE: "Forcee",
    CORRIGEE: "Corrigee",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Ecarts de caisse
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {sessionsWithEcarts.length} session{sessionsWithEcarts.length !== 1 ? "s" : ""} avec ecart
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
        >
          Retour au tableau de bord
        </Link>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="dateFrom" className="block text-xs text-zinc-500 dark:text-zinc-400">Du</label>
          <input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={dateFrom}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="dateTo" className="block text-xs text-zinc-500 dark:text-zinc-400">Au</label>
          <input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={dateTo}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="userId" className="block text-xs text-zinc-500 dark:text-zinc-400">Caissier</label>
          <select
            id="userId"
            name="userId"
            defaultValue={filterUserId}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Tous</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.nom}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Filtrer
        </button>
        {(dateFrom || dateTo || filterUserId) && (
          <Link
            href="/comptoir/ecarts"
            className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Reinitialiser
          </Link>
        )}
      </form>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sessions avec ecart</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{sessionsWithEcarts.length}</p>
        </div>
        <div className={cn(
          "rounded-xl border p-4",
          totalExcedent > 0
            ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        )}>
          <p className={cn("text-xs font-medium", totalExcedent > 0 ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400")}>
            Total excedent
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
            Total manquant
          </p>
          <p className={cn("mt-1 text-2xl font-bold", totalManquant > 0 ? "text-red-700 dark:text-red-300" : "text-zinc-900 dark:text-zinc-100")}>
            -{formatMontant(totalManquant)}
          </p>
        </div>
      </div>

      {/* Table */}
      {sessionsWithEcarts.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500">Aucun ecart de caisse pour la periode selectionnee</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Caissier</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Horaires</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium text-right">Attendu</th>
                <th className="px-4 py-2.5 font-medium text-right">Compte</th>
                <th className="px-4 py-2.5 font-medium text-right">Ecart cash</th>
                <th className="px-4 py-2.5 font-medium text-right">Ecart autres</th>
                <th className="px-4 py-2.5 font-medium text-right">Ecart total</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sessionsWithEcarts.map((s) => {
                const eCash = Number(s.ecartCash ?? 0);
                const eMM = Number(s.ecartMobileMoney ?? 0);
                const eTotal = eCash + eMM;
                const attenduTotal = Number(s.soldeTheoriqueCash ?? 0) + Number(s.soldeTheoriqueMobileMoney ?? 0);
                const compteTotal = Number(s.montantFermetureCash ?? 0) + Number(s.montantFermetureMobileMoney ?? 0);

                return (
                  <tr key={s.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                      {s.user.nom}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {s.fermetureAt
                        ? s.fermetureAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      {s.ouvertureAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      {" — "}
                      {s.fermetureAt?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) ?? "?"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {statutLabel[s.statut] ?? s.statut}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMontant(attenduTotal)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMontant(compteTotal)}
                    </td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-medium tabular-nums",
                      eCash === 0 ? "text-zinc-400" : eCash > 0 ? "text-blue-600" : "text-red-600"
                    )}>
                      {Math.abs(eCash) < 0.01 ? "—" : `${eCash > 0 ? "+" : ""}${formatMontant(eCash)}`}
                    </td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-medium tabular-nums",
                      eMM === 0 ? "text-zinc-400" : eMM > 0 ? "text-blue-600" : "text-red-600"
                    )}>
                      {Math.abs(eMM) < 0.01 ? "—" : `${eMM > 0 ? "+" : ""}${formatMontant(eMM)}`}
                    </td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-bold tabular-nums",
                      eTotal > 0 ? "text-blue-600" : "text-red-600"
                    )}>
                      {eTotal > 0 ? "+" : ""}{formatMontant(eTotal)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/comptoir/sessions/${s.id}`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {sessionsWithEcarts.some((s) => s.notes) && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Notes des sessions
          </h2>
          <div className="space-y-2">
            {sessionsWithEcarts
              .filter((s) => s.notes)
              .map((s) => (
                <div
                  key={`note-${s.id}`}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50"
                >
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{s.user.nom}</span>
                  <span className="mx-2 text-zinc-400">—</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{s.notes}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
