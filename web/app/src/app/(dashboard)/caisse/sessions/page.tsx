import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { SessionManager } from "@/components/caisse/SessionManager";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sessions de caisse",
};

export default async function SessionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role as Role;
  if (!hasRole(role, ["CAISSIER"])) {
    redirect("/caisse");
  }

  const userId = session.user.id as string;

  // Find the user's currently open session (if any)
  const openSession = await prisma.caisseSession.findFirst({
    where: {
      userId,
      statut: "OUVERTE",
    },
    include: {
      _count: { select: { ventes: true } },
    },
  });

  // If there is an open session, also compute total sales
  let serialized = null;

  if (openSession) {
    const salesAggregate = await prisma.vente.aggregate({
      where: {
        sessionId: openSession.id,
        statut: "VALIDEE",
      },
      _sum: { total: true },
    });

    // Compute solde théorique: fond + espèces encaissées - monnaie rendue
    const especesAgg = await prisma.paiement.aggregate({
      where: { mode: "ESPECES", vente: { sessionId: openSession.id, statut: "VALIDEE" } },
      _sum: { montant: true },
    });
    const totalPaiementsAgg = await prisma.paiement.aggregate({
      where: { vente: { sessionId: openSession.id, statut: "VALIDEE" } },
      _sum: { montant: true },
    });
    const especesRecues = Number(especesAgg._sum.montant ?? 0);
    const totalVentesNum = Number(salesAggregate._sum.total ?? 0);
    const totalPaiements = Number(totalPaiementsAgg._sum.montant ?? 0);
    const monnaieRendue = totalPaiements - totalVentesNum;
    const soldeTheorique = Number(openSession.montantOuverture) + especesRecues - monnaieRendue;

    serialized = {
      id: openSession.id,
      ouvertureAt: openSession.ouvertureAt.toISOString(),
      fermetureAt: openSession.fermetureAt?.toISOString() ?? null,
      montantOuverture: openSession.montantOuverture.toString(),
      montantFermeture: openSession.montantFermeture?.toString() ?? null,
      soldeTheorique,
      statut: openSession.statut as "OUVERTE" | "FERMEE",
      notes: openSession.notes,
      userId: openSession.userId,
      _count: { ventes: openSession._count.ventes },
      _sum: { total: salesAggregate._sum.total?.toString() ?? null },
    };
  }

  return (
    <div className="space-y-6" data-testid="sessions-page">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Sessions de caisse
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Ouvrez ou fermez votre session de caisse pour commencer les ventes.
        </p>
      </div>

      <SessionManager initialSession={serialized} />
    </div>
  );
}
