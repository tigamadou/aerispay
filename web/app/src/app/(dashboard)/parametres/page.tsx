import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ParametresForm } from "@/components/parametres/ParametresForm";
import type { Role } from "@prisma/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Parametres",
};

export default async function ParametresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  if (!hasPermission(role, "parametres:manage")) {
    redirect("/");
  }

  const parametres = await prisma.parametres.findUnique({
    where: { id: "default" },
  });

  const data = {
    nomCommerce: parametres?.nomCommerce ?? "",
    adresse: parametres?.adresse ?? "",
    telephone: parametres?.telephone ?? "",
    email: parametres?.email ?? "",
    rccm: parametres?.rccm ?? "",
    nif: parametres?.nif ?? "",
    logo: parametres?.logo ?? null,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Parametres
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Informations de la structure affichees sur les tickets de caisse.
        </p>
      </div>

      <ParametresForm initialData={data} />
    </div>
  );
}
