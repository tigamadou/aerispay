import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, hasPermission } from "@/lib/permissions";
import { SessionManager } from "@/components/comptoir/SessionManager";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";
import { computeSoldeTheoriqueLegacy } from "@/lib/services/cash-movement";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sessions de caisse",
};

const statutLabel: Record<string, string> = {
  OUVERTE: "Ouverte",
  FERMEE: "Fermee",
  EN_ATTENTE_CLOTURE: "En attente de cloture",
  EN_ATTENTE_VALIDATION: "En attente de validation",
  VALIDEE: "Validee",
  CONTESTEE: "Contestee",
  FORCEE: "Forcee",
  CORRIGEE: "Corrigee",
};

const statutColor: Record<string, string> = {
  OUVERTE: "bg-green-100 text-green-800",
  EN_ATTENTE_CLOTURE: "bg-yellow-100 text-yellow-800",
  EN_ATTENTE_VALIDATION: "bg-orange-100 text-orange-800",
  VALIDEE: "bg-blue-100 text-blue-800",
  CONTESTEE: "bg-red-100 text-red-800",
  FORCEE: "bg-zinc-200 text-zinc-800",
  CORRIGEE: "bg-purple-100 text-purple-800",
  FERMEE: "bg-zinc-100 text-zinc-600",
};

export default async function SessionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  const userId = session.user.id;
  const isCaissier = hasRole(role, ["CAISSIER"]);
  const canViewAll = hasPermission(role, "comptoir:gerer_session_autre");

  // CAISSIER: find own active session (any non-terminal state)
  const ownActiveSession = await prisma.comptoirSession.findFirst({
    where: {
      userId,
      statut: { in: ["OUVERTE", "EN_ATTENTE_CLOTURE", "EN_ATTENTE_VALIDATION", "CONTESTEE"] },
    },
    include: { _count: { select: { ventes: true } } },
  });

  // Serialize for SessionManager (backward compat)
  let serialized = null;
  if (ownActiveSession && ownActiveSession.statut === "OUVERTE") {
    const solde = await computeSoldeTheoriqueLegacy(ownActiveSession.id);
    const salesAggregate = await prisma.vente.aggregate({
      where: { sessionId: ownActiveSession.id, statut: "VALIDEE" },
      _sum: { total: true },
    });

    serialized = {
      id: ownActiveSession.id,
      ouvertureAt: ownActiveSession.ouvertureAt.toISOString(),
      fermetureAt: ownActiveSession.fermetureAt?.toISOString() ?? null,
      montantOuvertureCash: ownActiveSession.montantOuvertureCash.toString(),
      montantOuvertureMobileMoney: ownActiveSession.montantOuvertureMobileMoney.toString(),
      montantFermetureCash: ownActiveSession.montantFermetureCash?.toString() ?? null,
      montantFermetureMobileMoney: ownActiveSession.montantFermetureMobileMoney?.toString() ?? null,
      soldeTheoriqueCash: solde.cash,
      soldeTheoriqueMobileMoney: solde.mobileMoney,
      statut: ownActiveSession.statut as "OUVERTE" | "FERMEE",
      notes: ownActiveSession.notes,
      userId: ownActiveSession.userId,
      _count: { ventes: ownActiveSession._count.ventes },
      _sum: { total: salesAggregate._sum.total?.toString() ?? null },
    };
  }

  // If caissier has non-OUVERTE active session, show link to detail
  const hasPendingSession = ownActiveSession && ownActiveSession.statut !== "OUVERTE";

  // MANAGER/ADMIN: fetch all sessions (recent)
  let allSessions: Array<{
    id: string; statut: string; ouvertureAt: Date; fermetureAt: Date | null;
    user: { id: string; nom: string };
  }> = [];

  if (canViewAll) {
    allSessions = await prisma.comptoirSession.findMany({
      orderBy: { ouvertureAt: "desc" },
      take: 30,
      select: {
        id: true,
        statut: true,
        ouvertureAt: true,
        fermetureAt: true,
        user: { select: { id: true, nom: true } },
      },
    });
  }

  return (
    <div className="space-y-6" data-testid="sessions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Sessions de caisse
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isCaissier
              ? "Ouvrez ou fermez votre session de caisse."
              : "Vue d'ensemble de toutes les sessions."}
          </p>
        </div>
        <Link href="/caisse" className="text-sm text-indigo-600 hover:text-indigo-800">
          Retour caisse
        </Link>
      </div>

      {/* Caissier: pending session banner */}
      {hasPendingSession && ownActiveSession && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                Session en cours — {statutLabel[ownActiveSession.statut]}
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Votre session est en attente de traitement.
              </p>
            </div>
            <Link
              href={`/comptoir/sessions/${ownActiveSession.id}`}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition"
            >
              Voir le detail
            </Link>
          </div>
        </div>
      )}

      {/* Caissier: SessionManager for opening / simple close */}
      {isCaissier && !hasPendingSession && (
        <SessionManager initialSession={serialized} />
      )}

      {/* MANAGER/ADMIN: all sessions table */}
      {canViewAll && allSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Toutes les sessions ({allSessions.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600">Caissier</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600">Statut</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600">Ouverture</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600">Fermeture</th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {allSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">{s.user.nom}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statutColor[s.statut] ?? "bg-zinc-100 text-zinc-600"}`}>
                        {statutLabel[s.statut] ?? s.statut}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-600 text-xs">
                      {new Date(s.ouvertureAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 text-xs">
                      {s.fermetureAt ? new Date(s.fermetureAt).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/comptoir/sessions/${s.id}`}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
