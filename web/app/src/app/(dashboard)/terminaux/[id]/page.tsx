import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";
import { TerminalEditForm } from "@/components/terminaux/TerminalEditForm";
import { EnrollmentCodeButton } from "@/components/terminaux/EnrollmentCodeButton";
import { StoreTokensListe } from "@/components/terminaux/StoreTokensListe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terminal de caisse",
};

export default async function TerminalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const role = session.user.role as Role;
  if (!hasPermission(role, "rapports:consulter")) redirect("/");

  const { id } = await params;
  const terminal = await prisma.terminalCaisse.findUnique({ where: { id } });
  if (!terminal) notFound();

  const canManage = hasPermission(role, "parametres:manage");

  const jetonActif = await prisma.storeToken.findFirst({
    where: { terminalId: terminal.id, revoked: false },
    select: { id: true },
  });
  const alreadyEnrolled = jetonActif !== null;

  const soldes = await computeSoldeCaisseParMode(terminal.id);
  const totalSolde = soldes.reduce((acc, s) => acc + s.solde, 0);

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">
          {terminal.nom} <span className="font-mono text-zinc-500">({terminal.code})</span>
        </h1>
        <p className="text-sm text-zinc-500">{terminal.active ? "Actif" : "Inactif"}</p>
      </div>

      {canManage && <TerminalEditForm id={terminal.id} nom={terminal.nom} active={terminal.active} />}

      <section className="space-y-2">
        <h2 className="font-semibold">Caisse de ce terminal</h2>
        {soldes.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun mouvement — solde nul.</p>
        ) : (
          <table className="text-sm">
            <tbody>
              {soldes.map((s) => (
                <tr key={s.mode} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1 pr-8">{s.mode}</td>
                  <td className="py-1 text-right font-medium">{s.solde.toLocaleString("fr-FR")} FCFA</td>
                </tr>
              ))}
              <tr className="border-t border-zinc-300 font-semibold dark:border-zinc-700">
                <td className="py-1 pr-8">Total</td>
                <td className="py-1 text-right">{totalSolde.toLocaleString("fr-FR")} FCFA</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="flex gap-3 text-sm">
          <Link href={`/caisse/mouvements?terminalId=${terminal.id}`} className="text-indigo-600 hover:underline">
            Mouvements
          </Link>
          <Link href={`/comptoir/sessions?terminalId=${terminal.id}`} className="text-indigo-600 hover:underline">
            Sessions
          </Link>
        </div>
      </section>

      {canManage && (
        <section className="space-y-3">
          <h2 className="font-semibold">Enrôlement desktop</h2>
          <EnrollmentCodeButton terminalId={terminal.id} alreadyEnrolled={alreadyEnrolled} />
          <StoreTokensListe terminalId={terminal.id} canManage={canManage} />
        </section>
      )}
    </main>
  );
}
