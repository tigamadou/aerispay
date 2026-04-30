import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ProductForm } from "@/components/stock/ProductForm";
import { StockAlertBadge } from "@/components/stock/StockAlertBadge";
import { formatMontant, formatDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Détail produit",
};

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

const typeLabels: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  AJUSTEMENT: "Ajustement",
  RETOUR: "Retour",
  PERTE: "Perte",
};

export default async function ProductPage({ params }: ProductPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const role = session.user.role as Role;
  const canManage = hasPermission(role, "stock:manage");

  const produit = await prisma.produit.findUnique({
    where: { id },
    include: {
      categorie: { select: { id: true, nom: true, couleur: true } },
      mouvements: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!produit) {
    notFound();
  }

  const categories = canManage
    ? await prisma.categorie.findMany({
        select: { id: true, nom: true },
        orderBy: { nom: "asc" },
      })
    : [];

  const marge =
    Number(produit.prixVente) > 0
      ? ((Number(produit.prixVente) - Number(produit.prixAchat)) / Number(produit.prixVente)) * 100
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {produit.nom}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {produit.reference}
            {produit.codeBarres && ` — ${produit.codeBarres}`}
          </p>
        </div>
        <StockAlertBadge stockActuel={produit.stockActuel} stockMinimum={produit.stockMinimum} />
      </div>

      {/* Info summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Stock actuel</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{produit.stockActuel}</p>
          <p className="text-xs text-zinc-400">min: {produit.stockMinimum} {produit.stockMaximum ? `/ max: ${produit.stockMaximum}` : ""}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Prix de vente</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatMontant(Number(produit.prixVente))}</p>
          <p className="text-xs text-zinc-400">Achat: {formatMontant(Number(produit.prixAchat))}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Marge brute</p>
          <p className={`text-2xl font-bold ${marge > 0 ? "text-green-600" : "text-red-600"}`}>{marge.toFixed(1)}%</p>
          <p className="text-xs text-zinc-400">TVA: {Number(produit.tva)}%</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Catégorie</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{produit.categorie.nom}</p>
          <p className="text-xs text-zinc-400">Unité: {produit.unite}</p>
        </div>
      </div>

      {/* Recent movements */}
      {produit.mouvements.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Derniers mouvements
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium text-right">Qté</th>
                  <th className="px-4 py-2 font-medium text-right">Avant</th>
                  <th className="px-4 py-2 font-medium text-right">Après</th>
                  <th className="px-4 py-2 font-medium">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {produit.mouvements.map((mvt) => (
                  <tr key={mvt.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="px-4 py-2">{formatDateTime(mvt.createdAt)}</td>
                    <td className="px-4 py-2">{typeLabels[mvt.type] ?? mvt.type}</td>
                    <td className="px-4 py-2 text-right font-medium">{mvt.quantite}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">{mvt.quantiteAvant}</td>
                    <td className="px-4 py-2 text-right font-medium">{mvt.quantiteApres}</td>
                    <td className="px-4 py-2 text-zinc-500">{mvt.motif ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit form for ADMIN/MANAGER */}
      {canManage && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Modifier le produit
          </h2>
          <ProductForm
            mode="edit"
            categories={categories}
            initialData={{
              id: produit.id,
              nom: produit.nom,
              codeBarres: produit.codeBarres,
              categorieId: produit.categorieId,
              prixAchat: Number(produit.prixAchat),
              prixVente: Number(produit.prixVente),
              tva: Number(produit.tva),
              unite: produit.unite,
              stockMinimum: produit.stockMinimum,
              stockMaximum: produit.stockMaximum,
              description: produit.description,
              actif: produit.actif,
            }}
          />
        </div>
      )}
    </div>
  );
}
