import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ModesPaiementSection } from "@/components/modes-paiement/ModesPaiementSection";
import type { Role } from "@prisma/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modes de paiement",
};

export default async function ModesPaiementPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  if (!hasPermission(role, "parametres:manage")) {
    redirect("/");
  }

  const modesPaiement = await prisma.modePaiementConfig.findMany({
    where: { parametresId: "default" },
    orderBy: { ordre: "asc" },
    select: { id: true, code: true, label: true, active: true, ordre: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Modes de paiement
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Configurez les modes de paiement acceptés en caisse (libellé, activation, ordre).
        </p>
      </div>

      <ModesPaiementSection initialModes={modesPaiement} />
    </div>
  );
}
