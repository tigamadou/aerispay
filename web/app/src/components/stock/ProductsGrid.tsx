"use client";

import { useState } from "react";
import Link from "next/link";
import { StockAlertBadge } from "./StockAlertBadge";
import { formatMontant } from "@/lib/utils";

interface ProduitRow {
  id: string;
  reference: string;
  nom: string;
  image: string | null;
  prixVente: number;
  stockActuel: number;
  stockMinimum: number;
  actif: boolean;
  categorie: { id: string; nom: string; couleur: string | null };
}

interface ProductsGridProps {
  produits: ProduitRow[];
  total: number;
  page: number;
  pageSize: number;
  canManage: boolean;
}

export function ProductsGrid({ produits, total, page, pageSize, canManage }: ProductsGridProps) {
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

  function paginationHref(p: number) {
    if (typeof window === "undefined") return `/stock?page=${p}`;
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(p));
    return `/stock?${params.toString()}`;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-12 text-center text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950">
        Aucun produit trouvé.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((produit) => (
          <div
            key={produit.id}
            className={`group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 ${!produit.actif ? "opacity-50" : ""}`}
          >
            {/* Image */}
            <Link href={`/stock/${produit.id}`} className="block">
              <div className="aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                {produit.image ? (
                  <img
                    src={produit.image}
                    alt={produit.nom}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg className="h-12 w-12 text-zinc-300 dark:text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  </div>
                )}
              </div>
            </Link>

            {/* Stock badge overlay */}
            <div className="absolute right-2 top-2">
              <StockAlertBadge stockActuel={produit.stockActuel} stockMinimum={produit.stockMinimum} />
            </div>

            {/* Category badge overlay */}
            <div className="absolute left-2 top-2">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm"
                style={{
                  backgroundColor: produit.categorie.couleur ? `${produit.categorie.couleur}cc` : "rgba(99,102,241,0.8)",
                  color: "#fff",
                }}
              >
                {produit.categorie.nom}
              </span>
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col p-3">
              <Link href={`/stock/${produit.id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                  {produit.nom}
                </h3>
              </Link>
              <p className="mt-0.5 text-[11px] font-mono text-zinc-400">{produit.reference}</p>

              <div className="mt-auto flex items-end justify-between pt-2">
                <div>
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {formatMontant(produit.prixVente)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Stock: <span className="font-medium">{produit.stockActuel}</span>
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => toggleActive(produit.id, produit.actif)}
                    disabled={toggling === produit.id}
                    className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
                  >
                    {toggling === produit.id
                      ? "..."
                      : produit.actif
                        ? "Désactiver"
                        : "Activer"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
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
