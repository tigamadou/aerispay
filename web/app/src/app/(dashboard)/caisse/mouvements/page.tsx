import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MouvementsListe } from "@/components/caisse/MouvementsListe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mouvements de caisse",
};

export default async function MouvementsCaissePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Mouvements de caisse
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Historique de tous les mouvements de caisse
        </p>
      </div>
      <MouvementsListe />
    </div>
  );
}
