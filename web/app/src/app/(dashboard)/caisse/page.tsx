import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Caisse",
};

const modeLabel: Record<string, string> = {
  ESPECES: "Cash",
  MOBILE_MONEY: "Mobile Money",
  MOBILE_MONEY_MTN: "MomoPay",
  MOBILE_MONEY_MOOV: "MoovMoney",
  CELTIS_CASH: "Celtis Cash",
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

const typeColor: Record<string, string> = {
  FOND_INITIAL: "text-blue-600",
  VENTE: "text-green-600",
  REMBOURSEMENT: "text-red-600",
  APPORT: "text-emerald-600",
  RETRAIT: "text-orange-600",
  DEPENSE: "text-red-600",
  CORRECTION: "text-purple-600",
};

function formatMontant(montant: number | { toNumber?: () => number }): string {
  const num = typeof montant === "number" ? montant : Number(montant);
  return new Intl.NumberFormat("fr-FR", { style: "decimal", minimumFractionDigits: 0 }).format(num);
}

export default async function CaissePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;

  if (!hasPermission(role, "rapports:consulter")) redirect("/comptoir");

  // Fetch active caisse
  const caisse = await prisma.caisse.findFirst({
    where: { active: true },
    select: { id: true, nom: true, createdAt: true },
  });

  // Soldes par mode de paiement
  const soldes = caisse ? await computeSoldeCaisseParMode(caisse.id) : [];
  const soldeTotal = soldes.reduce((sum, s) => sum + s.solde, 0);

  // Derniers mouvements (10)
  const recentMovements = caisse
    ? await prisma.mouvementCaisse.findMany({
        where: { caisseId: caisse.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          mode: true,
          montant: true,
          motif: true,
          createdAt: true,
          auteur: { select: { nom: true } },
        },
      })
    : [];

  // Nombre total de mouvements aujourd'hui
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const mouvementsAujourdhui = caisse
    ? await prisma.mouvementCaisse.count({
        where: { caisseId: caisse.id, createdAt: { gte: todayStart } },
      })
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Caisse</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Etat de la caisse, soldes et mouvements
        </p>
      </div>

      {/* Caisse active */}
      {!caisse ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Aucune caisse active configuree.
          </p>
        </div>
      ) : (
        <>
          {/* Info caisse + solde global */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Caisse active</p>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{caisse.nom}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Solde theorique total</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatMontant(soldeTotal)} F
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Mouvements aujourd&apos;hui</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{mouvementsAujourdhui}</p>
            </div>
          </div>

          {/* Soldes par mode */}
          {soldes.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Soldes par mode de paiement
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {soldes.map((s) => (
                  <div
                    key={s.mode}
                    className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {modeLabel[s.mode] ?? s.mode}
                    </p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {formatMontant(s.solde)} F
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Derniers mouvements */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Derniers mouvements
              </h2>
              <Link
                href="/caisse/mouvements"
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Voir tout
              </Link>
            </div>
            {recentMovements.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Aucun mouvement enregistre.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                      <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Mode</th>
                      <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">Montant</th>
                      <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Motif</th>
                      <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Auteur</th>
                      <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {recentMovements.map((m) => (
                      <tr key={m.id}>
                        <td className={`px-4 py-2 font-medium ${typeColor[m.type] ?? "text-zinc-600"}`}>
                          {typeLabel[m.type] ?? m.type}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                          {modeLabel[m.mode] ?? m.mode}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-900 dark:text-zinc-100">
                          {formatMontant(m.montant)} F
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">
                          {m.motif ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{m.auteur.nom}</td>
                        <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                          {new Date(m.createdAt).toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Lien mouvements */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/caisse/mouvements"
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-2">
            <svg className="h-8 w-8 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Mouvements de caisse</h3>
          <p className="text-xs text-zinc-500">Historique complet des mouvements</p>
        </Link>

        <Link
          href="/comptoir/sessions"
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-2">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Sessions de comptoir</h3>
          <p className="text-xs text-zinc-500">Gerer les sessions de caisse</p>
        </Link>
      </div>
    </div>
  );
}
