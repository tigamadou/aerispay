import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductsGrid } from "@/components/stock/ProductsGrid";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stock — Produits",
};

interface StockPageProps {
  searchParams: Promise<{
    page?: string;
    categorieId?: string;
    statut?: string;
    actif?: string;
    recherche?: string;
    tri?: string;
    ordre?: string;
  }>;
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role as Role;
  const canManage = hasPermission(role, "stock:manage");

  if (!canManage) {
    redirect("/");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 20;

  const where: Record<string, unknown> = {};
  if (params.categorieId) where.categorieId = params.categorieId;
  if (params.actif !== undefined && params.actif !== "") {
    where.actif = params.actif === "true";
  } else {
    where.actif = true;
  }
  if (params.recherche) {
    where.OR = [
      { nom: { contains: params.recherche } },
      { reference: { contains: params.recherche } },
      { codeBarres: { contains: params.recherche } },
    ];
  }

  const allowedSorts: Record<string, string> = {
    nom: "nom",
    stock: "stockActuel",
    prix: "prixVente",
    createdAt: "createdAt",
  };
  const orderByField = allowedSorts[params.tri ?? "nom"] ?? "nom";
  const ordre = params.ordre === "desc" ? "desc" as const : "asc" as const;

  const [produits, total, categories] = await Promise.all([
    prisma.produit.findMany({
      where,
      include: { categorie: { select: { id: true, nom: true, couleur: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [orderByField]: ordre },
    }),
    prisma.produit.count({ where }),
    prisma.categorie.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  let serialized = produits.map((p) => ({
    id: p.id,
    reference: p.reference,
    nom: p.nom,
    image: p.image,
    prixVente: Number(p.prixVente),
    stockActuel: p.stockActuel,
    stockMinimum: p.stockMinimum,
    actif: p.actif,
    categorie: p.categorie,
  }));

  // Post-filter for stock status
  if (params.statut === "rupture") {
    serialized = serialized.filter((p) => p.stockActuel <= p.stockMinimum && p.stockActuel > 0);
  } else if (params.statut === "epuise") {
    serialized = serialized.filter((p) => p.stockActuel === 0);
  } else if (params.statut === "alerte") {
    serialized = serialized.filter((p) => p.stockActuel > p.stockMinimum && p.stockActuel <= 2 * p.stockMinimum);
  } else if (params.statut === "normal") {
    serialized = serialized.filter((p) => p.stockActuel > 2 * p.stockMinimum);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Stock</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Catalogue produits et niveaux de stock.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Link
                href="/stock/mouvements"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Mouvements
              </Link>
              <Link
                href="/stock/categories"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Catégories
              </Link>
              <Link
                href="/stock/nouveau"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Nouveau produit
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Recherche</label>
          <input
            name="recherche"
            type="text"
            defaultValue={params.recherche ?? ""}
            placeholder="Nom, référence, code-barres..."
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Catégorie</label>
          <select
            name="categorieId"
            defaultValue={params.categorieId ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Statut stock</label>
          <select
            name="statut"
            defaultValue={params.statut ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Tous</option>
            <option value="normal">Normal</option>
            <option value="alerte">Alerte</option>
            <option value="rupture">Rupture</option>
            <option value="epuise">Épuisé</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Actif</label>
          <select
            name="actif"
            defaultValue={params.actif ?? "true"}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Tous</option>
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Tri</label>
          <select
            name="tri"
            defaultValue={params.tri ?? "nom"}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="nom">Nom</option>
            <option value="stock">Stock</option>
            <option value="prix">Prix</option>
            <option value="createdAt">Date</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Ordre</label>
          <select
            name="ordre"
            defaultValue={params.ordre ?? "asc"}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="asc">Croissant</option>
            <option value="desc">Décroissant</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Filtrer
        </button>
      </form>

      <ProductsGrid
        produits={serialized}
        total={total}
        page={page}
        pageSize={pageSize}
        canManage={canManage}
      />
    </div>
  );
}
