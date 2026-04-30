"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StockAlertBadge } from "./StockAlertBadge";
import { formatMontant } from "@/lib/utils";

interface ProduitRow {
  id: string;
  reference: string;
  nom: string;
  prixVente: number;
  stockActuel: number;
  stockMinimum: number;
  actif: boolean;
  categorie: { id: string; nom: string; couleur: string | null };
}

interface ProductsTableProps {
  produits: ProduitRow[];
  total: number;
  page: number;
  pageSize: number;
  canManage: boolean;
}

export function ProductsTable({ produits, total, page, pageSize, canManage }: ProductsTableProps) {
  const router = useRouter();
  const [toggling, setToggling] = useState<string | null>(null);
  const [items, setItems] = useState(produits);
  const totalPages = Math.ceil(total / pageSize);

  async function toggleActive(id: string, currentActive: boolean) {
    setToggling(id);
    try {
      const res = await fetch(`/api/produits/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !currentActive }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((p) => (p.id === id ? { ...p, actif: !currentActive } : p))
        );
      }
    } finally {
      setToggling(null);
    }
  }

  // Build current search params for pagination links
  function paginationHref(p: number) {
    if (typeof window === "undefined") return `/stock?page=${p}`;
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(p));
    return `/stock?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Référence</th>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium text-right">Prix vente</th>
              <th className="px-4 py-3 font-medium text-right">Stock</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((produit) => (
              <tr
                key={produit.id}
                className={`text-zinc-700 dark:text-zinc-300 ${!produit.actif ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-3 font-mono text-xs">{produit.reference}</td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/stock/${produit.id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                    {produit.nom}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: produit.categorie.couleur ? `${produit.categorie.couleur}20` : undefined,
                      color: produit.categorie.couleur ?? undefined,
                    }}
                  >
                    {produit.categorie.nom}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{formatMontant(produit.prixVente)}</td>
                <td className="px-4 py-3 text-right font-medium">{produit.stockActuel}</td>
                <td className="px-4 py-3">
                  <StockAlertBadge stockActuel={produit.stockActuel} stockMinimum={produit.stockMinimum} />
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/stock/${produit.id}`}
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-xs font-medium"
                      >
                        Modifier
                      </Link>
                      <button
                        onClick={() => toggleActive(produit.id, produit.actif)}
                        disabled={toggling === produit.id}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 disabled:opacity-50"
                      >
                        {toggling === produit.id
                          ? "..."
                          : produit.actif
                            ? "Désactiver"
                            : "Activer"}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-zinc-400">
                  Aucun produit trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            Page {page} sur {totalPages} ({total} produit{total > 1 ? "s" : ""})
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
