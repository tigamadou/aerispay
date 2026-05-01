import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission, hasRole } from "@/lib/permissions";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Caisse",
};

interface SessionInfo {
  id: string;
  statut: string;
  ouvertureAt: Date;
  user: { nom: string };
}

export default async function CaissePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;

  // CAISSIER n'a pas acces au module caisse — uniquement au POS/comptoir
  if (!hasPermission(role, "rapports:consulter")) redirect("/comptoir");

  const isCaissier = hasRole(role, ["CAISSIER"]);
  const canViewReports = hasPermission(role, "rapports:consulter");
  const canVerifyIntegrity = hasPermission(role, "comptoir:verifier_integrite");

  // Fetch user's open session (if any)
  const openSession = await prisma.comptoirSession.findFirst({
    where: { userId: session.user.id, statut: "OUVERTE" },
    select: { id: true, statut: true, ouvertureAt: true, user: { select: { nom: true } } },
  });

  // For managers: fetch all active sessions
  let activeSessions: SessionInfo[] = [];
  if (!isCaissier) {
    activeSessions = await prisma.comptoirSession.findMany({
      where: { statut: { in: ["OUVERTE", "EN_ATTENTE_CLOTURE", "EN_ATTENTE_VALIDATION", "CONTESTEE"] } },
      select: { id: true, statut: true, ouvertureAt: true, user: { select: { nom: true } } },
      orderBy: { ouvertureAt: "desc" },
    });
  }

  // Recent closed sessions count (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const closedCount = await prisma.comptoirSession.count({
    where: {
      statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] },
      fermetureAt: { gte: weekAgo },
    },
  });

  const statutLabel: Record<string, string> = {
    OUVERTE: "Ouverte",
    EN_ATTENTE_CLOTURE: "En attente de cloture",
    EN_ATTENTE_VALIDATION: "En attente de validation",
    CONTESTEE: "Contestee",
    VALIDEE: "Validee",
    FORCEE: "Forcee",
    CORRIGEE: "Corrigee",
    FERMEE: "Fermee",
  };

  const statutColor: Record<string, string> = {
    OUVERTE: "bg-green-100 text-green-800",
    EN_ATTENTE_CLOTURE: "bg-yellow-100 text-yellow-800",
    EN_ATTENTE_VALIDATION: "bg-orange-100 text-orange-800",
    CONTESTEE: "bg-red-100 text-red-800",
    VALIDEE: "bg-blue-100 text-blue-800",
    FORCEE: "bg-zinc-100 text-zinc-800",
    CORRIGEE: "bg-purple-100 text-purple-800",
    FERMEE: "bg-zinc-100 text-zinc-600",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Caisse</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Module de gestion de caisse — sessions, mouvements, ecarts
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* POS */}
        <Link
          href="/comptoir"
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-2xl mb-2">
            <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Point de vente</h3>
          <p className="text-xs text-zinc-500">Interface de vente POS</p>
        </Link>

        {/* Sessions */}
        <Link
          href="/comptoir/sessions"
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-2xl mb-2">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Sessions</h3>
          <p className="text-xs text-zinc-500">Ouvrir, fermer, valider</p>
        </Link>

        {/* Ventes */}
        <Link
          href="/comptoir/ventes"
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-2xl mb-2">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Ventes</h3>
          <p className="text-xs text-zinc-500">Historique et details</p>
        </Link>

        {/* Mouvements */}
        <Link
          href="/caisse/mouvements"
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-2xl mb-2">
            <svg className="h-8 w-8 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Mouvements</h3>
          <p className="text-xs text-zinc-500">Tous les mouvements de caisse</p>
        </Link>

        {/* Ecarts — MANAGER/ADMIN only */}
        {canViewReports && (
          <Link
            href="/comptoir/discrepancies"
            className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-2xl mb-2">
              <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Ecarts</h3>
            <p className="text-xs text-zinc-500">Suivi des ecarts de caisse</p>
          </Link>
        )}
      </div>

      {/* Current session status */}
      {openSession && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-900 dark:text-green-100">Session en cours</h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                Ouverte le {new Date(openSession.ouvertureAt).toLocaleString("fr-FR")}
              </p>
            </div>
            <Link
              href="/comptoir"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition"
            >
              Aller au POS
            </Link>
          </div>
        </div>
      )}

      {/* Active sessions (MANAGER/ADMIN) */}
      {!isCaissier && activeSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Sessions actives ({activeSessions.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Caissier</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Statut</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Ouverture</th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {activeSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">{s.user.nom}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statutColor[s.statut] ?? "bg-zinc-100 text-zinc-600"}`}>
                        {statutLabel[s.statut] ?? s.statut}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {new Date(s.ouvertureAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/comptoir/sessions`} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                        Voir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Sessions actives</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {isCaissier ? (openSession ? 1 : 0) : activeSessions.length}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Sessions cloturees (7j)</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{closedCount}</p>
        </div>
        {canVerifyIntegrity && (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Verification integrite</p>
            <Link href="/comptoir/sessions" className="text-sm text-indigo-600 hover:text-indigo-800">
              Verifier les sessions
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
