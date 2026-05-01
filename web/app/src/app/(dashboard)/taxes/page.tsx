import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { TaxesSection } from "@/components/parametres/TaxesSection";
import type { Role } from "@prisma/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Taxes",
};

export default async function TaxesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  if (!hasPermission(role, "parametres:manage")) {
    redirect("/");
  }

  const taxes = await prisma.taxe.findMany({
    where: { parametresId: "default" },
    orderBy: { ordre: "asc" },
  });

  const taxesData = taxes.map((t) => ({
    id: t.id,
    nom: t.nom,
    taux: Number(t.taux),
    active: t.active,
    ordre: t.ordre,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Taxes
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Configurez les taxes appliquees aux ventes (TVA, AIB, etc.).
        </p>
      </div>

      <TaxesSection initialTaxes={taxesData} />
    </div>
  );
}
