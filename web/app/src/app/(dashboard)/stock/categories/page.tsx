import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { CategoryManager } from "@/components/stock/CategoryManager";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catégories",
};

export default async function CategoriesPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "stock:manage")) {
    redirect("/");
  }

  const categories = await prisma.categorie.findMany({
    include: { _count: { select: { produits: true } } },
    orderBy: { nom: "asc" },
  });

  const serialized = categories.map((c) => ({
    id: c.id,
    nom: c.nom,
    description: c.description,
    couleur: c.couleur,
    _count: c._count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Catégories
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Gérez les catégories de produits.
        </p>
      </div>

      <CategoryManager categories={serialized} />
    </div>
  );
}
