import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { NouveauMouvementForm } from "@/components/caisse/NouveauMouvementForm";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouveau mouvement de caisse",
};

export default async function NouveauMouvementPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!hasPermission(session.user.role as Role, "rapports:consulter")) redirect("/comptoir");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/caisse/mouvements"
          className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
        >
          &larr; Retour aux mouvements
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Nouveau mouvement de caisse
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enregistrer un apport, retrait ou depense sur la caisse.
        </p>
      </div>
      <NouveauMouvementForm />
    </div>
  );
}
