import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ProductForm } from "@/components/stock/ProductForm";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouveau produit",
};

export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "stock:manage")) {
    redirect("/stock");
  }

  const categories = await prisma.categorie.findMany({
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Nouveau produit
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Ajoutez un nouveau produit au catalogue.
        </p>
      </div>

      <ProductForm mode="create" categories={categories} />
    </div>
  );
}
