import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission, hasRole } from "@/lib/permissions";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";
import { SessionDetailActions } from "@/components/caisse/SessionDetailActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detail session",
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

const typeLabel: Record<string, string> = {
  FOND_INITIAL: "Fond initial",
  VENTE: "Vente",
  REMBOURSEMENT: "Remboursement",
  APPORT: "Apport",
  RETRAIT: "Retrait",
  DEPENSE: "Depense",
  CORRECTION: "Correction",
};

const modeLabel: Record<string, string> = {
  ESPECES: "Especes",
  MOBILE_MONEY: "Mobile Money",
  MOBILE_MONEY_MTN: "MTN Money",
  MOBILE_MONEY_MOOV: "Moov Money",
  CARTE_BANCAIRE: "Carte bancaire",
};

function formatMontant(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString("fr-FR")} FCFA`;
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessionAuth = await auth();
  if (!sessionAuth?.user) redirect("/login");

  const { id } = await params;
  const role = sessionAuth.user.role as Role;

  const session = await prisma.comptoirSession.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, nom: true, email: true } },
      valideur: { select: { id: true, nom: true } },
      ventes: {
        where: { statut: "VALIDEE" },
        select: { id: true, numero: true, total: true, dateVente: true },
        orderBy: { dateVente: "asc" },
      },
      sessionCorrective: { select: { id: true, notes: true } },
    },
  });

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Session introuvable</p>
      </div>
    );
  }

  // Access control: CAISSIER can only see own session
  const isCaissier = hasRole(role, ["CAISSIER"]);
  if (isCaissier && session.userId !== sessionAuth.user.id) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Acces refuse</p>
      </div>
    );
  }

  const mouvements = await prisma.mouvementCaisse.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    include: {
      auteur: { select: { nom: true } },
      vente: { select: { numero: true } },
    },
  });

  const canValidate = hasPermission(role, "comptoir:valider_session") || role === "CAISSIER";
  const canForceClose = hasPermission(role, "comptoir:force_close");
  const canVerify = hasPermission(role, "comptoir:verifier_integrite");
  const canCorrect = hasPermission(role, "comptoir:session_corrective");
  const canViewZReport = hasPermission(role, "rapports:consulter");

  const nbVentes = session.ventes.length;
  const totalVentes = session.ventes.reduce((s, v) => s + Number(v.total), 0);

  const ecartsParMode = session.ecartsParMode as Record<string, {
    theorique?: number; declare?: number; declareCaissier?: number;
    declareValideur?: number; ecart: number; categorie?: string | null;
  }> | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Session
            </h1>
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statutColor[session.statut] ?? "bg-zinc-100"}`}>
              {statutLabel[session.statut] ?? session.statut}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Caissier : {session.user.nom} — Ouverture : {new Date(session.ouvertureAt).toLocaleString("fr-FR")}
            {session.fermetureAt && ` — Fermeture : ${new Date(session.fermetureAt).toLocaleString("fr-FR")}`}
          </p>
        </div>
        <Link href="/comptoir/sessions" className="text-sm text-indigo-600 hover:text-indigo-800">
          Retour sessions
        </Link>
      </div>

      {/* Actions (client component) */}
      <SessionDetailActions
        sessionId={id}
        statut={session.statut}
        userId={session.userId}
        currentUserId={sessionAuth.user.id}
        canValidate={canValidate}
        canForceClose={canForceClose}
        canVerify={canVerify}
        canCorrect={canCorrect}
        canViewZReport={canViewZReport}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500">Fond de caisse</p>
          <p className="text-lg font-bold">{Number(session.montantOuvertureCash).toLocaleString("fr-FR")} FCFA</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500">Ventes</p>
          <p className="text-lg font-bold">{nbVentes} ({totalVentes.toLocaleString("fr-FR")} FCFA)</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500">Mouvements</p>
          <p className="text-lg font-bold">{mouvements.length}</p>
        </div>
        {session.hashIntegrite && (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">Hash</p>
            <p className="text-xs font-mono text-zinc-600 truncate">{session.hashIntegrite}</p>
          </div>
        )}
      </div>

      {/* Ecarts */}
      {ecartsParMode && Object.keys(ecartsParMode).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Ecarts par mode</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600">Mode</th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600">Theorique</th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600">Declare</th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600">Ecart</th>
                  <th className="px-4 py-2 text-center font-medium text-zinc-600">Categorie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {Object.entries(ecartsParMode).map(([mode, data]) => (
                  <tr key={mode}>
                    <td className="px-4 py-2">{modeLabel[mode] ?? mode}</td>
                    <td className="px-4 py-2 text-right font-mono">{(data.theorique ?? 0).toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2 text-right font-mono">{(data.declare ?? data.declareCaissier ?? 0).toLocaleString("fr-FR")}</td>
                    <td className={`px-4 py-2 text-right font-mono font-medium ${data.ecart < 0 ? "text-red-600" : data.ecart > 0 ? "text-emerald-600" : ""}`}>
                      {formatMontant(data.ecart)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {data.categorie ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          data.categorie === "MINEUR" ? "bg-yellow-50 text-yellow-700" :
                          data.categorie === "MOYEN" ? "bg-orange-50 text-orange-700" :
                          "bg-red-50 text-red-700"
                        }`}>
                          {data.categorie}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mouvements de caisse */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Mouvements de caisse</h2>
        {mouvements.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun mouvement</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Heure</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Mode</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">Montant</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Motif</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Auteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {mouvements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 text-zinc-500 text-xs">
                      {new Date(m.createdAt).toLocaleTimeString("fr-FR")}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium">{typeLabel[m.type] ?? m.type}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{modeLabel[m.mode] ?? m.mode}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs font-medium ${Number(m.montant) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatMontant(Number(m.montant))}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600 max-w-[200px] truncate">
                      {m.motif ?? (m.vente ? `Vente ${m.vente.numero}` : "—")}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">{m.auteur.nom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Correction */}
      {session.sessionCorrective && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900 dark:bg-purple-950">
          <h3 className="font-semibold text-purple-900 dark:text-purple-100">Session corrective</h3>
          <p className="text-sm text-purple-700 dark:text-purple-300">{session.sessionCorrective.notes}</p>
          <Link href={`/comptoir/sessions/${session.sessionCorrective.id}`} className="text-sm text-purple-600 hover:text-purple-800 mt-1 inline-block">
            Voir la session corrective
          </Link>
        </div>
      )}

      {/* Valideur */}
      {session.valideur && (
        <p className="text-sm text-zinc-500">
          Valide par : {session.valideur.nom}
        </p>
      )}

      {/* Force close motif */}
      {session.motifForceClose && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100">Motif de fermeture forcee</h3>
          <p className="text-sm text-amber-700 dark:text-amber-300">{session.motifForceClose}</p>
        </div>
      )}
    </div>
  );
}
