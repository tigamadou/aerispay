import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";
import { TerminauxListe, type TerminalListItem } from "@/components/terminaux/TerminauxListe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terminaux de caisse",
};

export default async function TerminauxPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const role = session.user.role as Role;
  if (!hasPermission(role, "rapports:consulter")) redirect("/");

  const terminaux = await prisma.terminalCaisse.findMany({ orderBy: { createdAt: "asc" } });
  const items: TerminalListItem[] = await Promise.all(
    terminaux.map(async (t) => {
      const s = await prisma.comptoirSession.findFirst({
        where: { terminalId: t.id, statut: "OUVERTE" },
        select: { id: true, ouvertureAt: true, user: { select: { nom: true } } },
      });
      const soldes = await computeSoldeCaisseParMode(t.id);
      return {
        id: t.id,
        code: t.code,
        nom: t.nom,
        active: t.active,
        createdAt: t.createdAt,
        sessionOuverte: s ? { id: s.id, caissier: s.user.nom, ouvertureAt: s.ouvertureAt } : null,
        soldeEspeces: soldes.find((x) => x.mode === "ESPECES")?.solde ?? 0,
      };
    }),
  );

  return (
    <main className="p-6">
      <TerminauxListe items={items} canManage={hasPermission(role, "parametres:manage")} />
    </main>
  );
}
