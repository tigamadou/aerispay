"use client";

import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

interface MouvementRow {
  id: string;
  type: string;
  quantite: number;
  quantiteAvant: number;
  quantiteApres: number;
  motif: string | null;
  reference: string | null;
  createdAt: string;
  produit: { id: string; nom: string; reference: string };
}

interface MovementTableProps {
  mouvements: MouvementRow[];
  total: number;
  page: number;
  pageSize: number;
}

const typeLabels: Record<string, { label: string; classes: string }> = {
  ENTREE: { label: "Entrée", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  SORTIE: { label: "Sortie", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  AJUSTEMENT: { label: "Ajustement", classes: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  RETOUR: { label: "Retour", classes: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  PERTE: { label: "Perte", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

export function MovementTable({ mouvements, total, page, pageSize }: MovementTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  function paginationHref(p: number) {
    if (typeof window === "undefined") return `/stock/mouvements?page=${p}`;
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(p));
    return `/stock/mouvements?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Quantité</th>
              <th className="px-4 py-3 font-medium text-right">Avant</th>
              <th className="px-4 py-3 font-medium text-right">Après</th>
              <th className="px-4 py-3 font-medium">Motif / Réf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {mouvements.map((mvt) => {
              const info = typeLabels[mvt.type] ?? { label: mvt.type, classes: "bg-zinc-100 text-zinc-700" };
              return (
                <tr key={mvt.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(mvt.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/stock/${mvt.produit.id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                      {mvt.produit.nom}
                    </Link>
                    <span className="ml-1 text-xs text-zinc-400">{mvt.produit.reference}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.classes}`}>
                      {info.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{mvt.quantite}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{mvt.quantiteAvant}</td>
                  <td className="px-4 py-3 text-right font-medium">{mvt.quantiteApres}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {mvt.motif && <span>{mvt.motif}</span>}
                    {mvt.reference && <span className="ml-1 text-xs text-zinc-400">({mvt.reference})</span>}
                  </td>
                </tr>
              );
            })}
            {mouvements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  Aucun mouvement trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            Page {page} sur {totalPages} ({total} mouvement{total > 1 ? "s" : ""})
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={paginationHref(page - 1)}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={paginationHref(page + 1)}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
