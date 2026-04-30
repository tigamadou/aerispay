import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { MovementForm } from "@/components/stock/MovementForm";
import { MovementTable } from "@/components/stock/MovementTable";
import type { Metadata } from "next";
import type { Role, TypeMouvement } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mouvements de stock",
};

interface MouvementsPageProps {
  searchParams: Promise<{
    page?: string;
    produitId?: string;
    type?: string;
    dateDebut?: string;
    dateFin?: string;
  }>;
}

export default async function MouvementsPage({ searchParams }: MouvementsPageProps) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "stock:manage")) {
    redirect("/stock");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 20;

  const where: Record<string, unknown> = {};
  if (params.produitId) where.produitId = params.produitId;
  if (params.type) where.type = params.type as TypeMouvement;
  if (params.dateDebut || params.dateFin) {
    const createdAt: Record<string, Date> = {};
    if (params.dateDebut) createdAt.gte = new Date(params.dateDebut);
    if (params.dateFin) createdAt.lte = new Date(params.dateFin);
    where.createdAt = createdAt;
  }

  const [mouvements, total, produits] = await Promise.all([
    prisma.mouvementStock.findMany({
      where,
      include: {
        produit: { select: { id: true, nom: true, reference: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.mouvementStock.count({ where }),
    prisma.produit.findMany({
      where: { actif: true },
      select: { id: true, nom: true, reference: true, stockActuel: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const serializedMouvements = mouvements.map((m) => ({
    id: m.id,
    type: m.type,
    quantite: m.quantite,
    quantiteAvant: m.quantiteAvant,
    quantiteApres: m.quantiteApres,
    motif: m.motif,
    reference: m.reference,
    createdAt: m.createdAt.toISOString(),
    produit: m.produit,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Mouvements de stock
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enregistrez et consultez les mouvements de stock.
        </p>
      </div>

      <MovementForm produits={produits} />

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Produit</label>
          <select
            name="produitId"
            defaultValue={params.produitId ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Tous</option>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>{p.nom} ({p.reference})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Type</label>
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Tous</option>
            <option value="ENTREE">Entrée</option>
            <option value="SORTIE">Sortie</option>
            <option value="AJUSTEMENT">Ajustement</option>
            <option value="RETOUR">Retour</option>
            <option value="PERTE">Perte</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Date début</label>
          <input
            name="dateDebut"
            type="date"
            defaultValue={params.dateDebut ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Date fin</label>
          <input
            name="dateFin"
            type="date"
            defaultValue={params.dateFin ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Filtrer
        </button>
      </form>

      <MovementTable
        mouvements={serializedMouvements}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
