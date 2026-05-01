import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ecarts de caisse",
};

interface EcartDetail {
  theorique?: number;
  declare?: number;
  declareCaissier?: number;
  declareValideur?: number;
  montantReference?: number;
  ecart: number;
  categorie: string | null;
}

export default async function DiscrepanciesPage() {
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

  // Fetch closed sessions with non-null ecarts
  const sessions = await prisma.comptoirSession.findMany({
    where: {
      statut: { in: ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"] },
      ecartsParMode: { not: undefined },
    },
    orderBy: { fermetureAt: "desc" },
    take: 50,
    select: {
      id: true,
      statut: true,
      ouvertureAt: true,
      fermetureAt: true,
      ecartsParMode: true,
      user: { select: { id: true, nom: true } },
    },
  });

  // Filter to only sessions with non-zero ecarts
  const discrepancies = sessions
    .map((s) => {
      const ecarts = s.ecartsParMode as Record<string, EcartDetail> | null;
      if (!ecarts) return null;
      const nonZero = Object.entries(ecarts).filter(([, e]) => e.ecart !== 0);
      if (nonZero.length === 0) return null;
      return { ...s, ecarts: Object.fromEntries(nonZero) };
    })
    .filter(Boolean) as Array<{
      id: string;
      statut: string;
      ouvertureAt: Date;
      fermetureAt: Date | null;
      user: { id: string; nom: string };
      ecarts: Record<string, EcartDetail>;
    }>;

  const statutLabel: Record<string, string> = {
    VALIDEE: "Validee",
    FORCEE: "Forcee",
    CORRIGEE: "Corrigee",
    FERMEE: "Fermee",
  };

  const categorieColor: Record<string, string> = {
    MINEUR: "text-yellow-700 bg-yellow-50",
    MOYEN: "text-orange-700 bg-orange-50",
    MAJEUR: "text-red-700 bg-red-50",
  };

  const modeLabel: Record<string, string> = {
    ESPECES: "Especes",
    MOBILE_MONEY: "Mobile Money",
    MOBILE_MONEY_MTN: "MTN Money",
    MOBILE_MONEY_MOOV: "Moov Money",
    CARTE_BANCAIRE: "Carte bancaire",
  };

  function formatMontant(n: number): string {
    const prefix = n > 0 ? "+" : "";
    return `${prefix}${n.toLocaleString("fr-FR")} FCFA`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Ecarts de caisse</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sessions avec ecarts non nuls (50 dernieres)
          </p>
        </div>
        <Link
          href="/caisse"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Retour caisse
        </Link>
      </div>

      {discrepancies.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500">Aucun ecart de caisse detecte</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Caissier</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Statut</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Fermeture</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Mode</th>
                <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">Ecart</th>
                <th className="px-4 py-2 text-center font-medium text-zinc-600 dark:text-zinc-400">Categorie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {discrepancies.map((d) =>
                Object.entries(d.ecarts).map(([mode, detail], i) => (
                  <tr key={`${d.id}-${mode}`} className={i === 0 ? "" : "border-t-0"}>
                    {i === 0 ? (
                      <>
                        <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100" rowSpan={Object.keys(d.ecarts).length}>
                          {d.user.nom}
                        </td>
                        <td className="px-4 py-2" rowSpan={Object.keys(d.ecarts).length}>
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700">
                            {statutLabel[d.statut] ?? d.statut}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400" rowSpan={Object.keys(d.ecarts).length}>
                          {d.fermetureAt ? new Date(d.fermetureAt).toLocaleString("fr-FR") : "—"}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {modeLabel[mode] ?? mode}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono font-medium ${detail.ecart < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatMontant(detail.ecart)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {detail.categorie ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${categorieColor[detail.categorie] ?? ""}`}>
                          {detail.categorie}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
