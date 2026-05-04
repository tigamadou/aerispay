import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { getSeuil } from "@/lib/services/seuils";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ecarts recurrents",
};

export default async function RecurringDiscrepanciesPage() {
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

  const recurringCount = await getSeuil("THRESHOLD_RECURRING_COUNT");
  const periodDays = await getSeuil("THRESHOLD_RECURRING_PERIOD_DAYS");

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - periodDays);

  const sessions = await prisma.comptoirSession.findMany({
    where: {
      statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] },
      fermetureAt: { gte: sinceDate },
      ecartsParMode: { not: undefined },
    },
    select: {
      id: true,
      userId: true,
      fermetureAt: true,
      ecartsParMode: true,
      user: { select: { id: true, nom: true, email: true } },
    },
  });

  // Count non-zero ecarts per user
  const userMap = new Map<string, {
    user: { id: string; nom: string; email: string };
    count: number;
    sessions: Array<{ id: string; fermetureAt: Date | null }>;
  }>();

  for (const s of sessions) {
    const ecarts = s.ecartsParMode as Record<string, { ecart: number }> | null;
    if (!ecarts) continue;
    const hasNonZero = Object.values(ecarts).some((e) => e.ecart !== 0);
    if (!hasNonZero) continue;

    let entry = userMap.get(s.userId);
    if (!entry) {
      entry = { user: s.user, count: 0, sessions: [] };
      userMap.set(s.userId, entry);
    }
    entry.count++;
    entry.sessions.push({ id: s.id, fermetureAt: s.fermetureAt });
  }

  const recurring = Array.from(userMap.values())
    .filter((e) => e.count >= recurringCount)
    .sort((a, b) => b.count - a.count);

  const allWithEcarts = Array.from(userMap.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Ecarts recurrents</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Caissiers avec {recurringCount}+ ecarts dans les {periodDays} derniers jours
          </p>
        </div>
        <Link href="/comptoir/discrepancies" className="text-sm text-indigo-600 hover:text-indigo-800">
          Tous les ecarts
        </Link>
      </div>

      {/* Alertes */}
      {recurring.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <h3 className="font-semibold text-red-900 dark:text-red-100">
            {recurring.length} caissier{recurring.length > 1 ? "s" : ""} en alerte recurrence
          </h3>
          <p className="text-sm text-red-700 dark:text-red-300">
            Ces caissiers ont atteint ou depasse le seuil de {recurringCount} ecarts en {periodDays} jours.
          </p>
        </div>
      )}

      {/* Table */}
      {allWithEcarts.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500">Aucun ecart detecte sur les {periodDays} derniers jours</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-zinc-600">Caissier</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-600">Email</th>
                <th className="px-4 py-2 text-center font-medium text-zinc-600">Ecarts ({periodDays}j)</th>
                <th className="px-4 py-2 text-center font-medium text-zinc-600">Statut</th>
                <th className="px-4 py-2 text-right font-medium text-zinc-600">Derniere session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {allWithEcarts.map((entry) => {
                const isAlert = entry.count >= recurringCount;
                const lastSession = entry.sessions.sort((a, b) =>
                  (b.fermetureAt?.getTime() ?? 0) - (a.fermetureAt?.getTime() ?? 0)
                )[0];

                return (
                  <tr key={entry.user.id} className={isAlert ? "bg-red-50/50 dark:bg-red-950/30" : ""}>
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {entry.user.nom}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{entry.user.email}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                        isAlert ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-600"
                      }`}>
                        {entry.count}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isAlert ? (
                        <span className="text-xs font-medium text-red-600">ALERTE</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Normal</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {lastSession && (
                        <Link href={`/comptoir/sessions/${lastSession.id}`} className="text-xs text-indigo-600 hover:text-indigo-800">
                          {lastSession.fermetureAt ? new Date(lastSession.fermetureAt).toLocaleDateString("fr-FR") : "—"}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
