import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission, hasRole } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { CancelButtonClient } from "@/components/comptoir/CancelButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Détail de la vente",
};

interface VenteDetailPageProps {
  params: Promise<{ id: string }>;
}

function fmt(montant: number | string | { toString(): string }): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(Number(montant))).replace(/\u202F/g, " ")} FCFA`;
}

function fmtDate(date: Date | string): string {
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statutStyle: Record<string, { text: string; className: string }> = {
  VALIDEE: {
    text: "Validée",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  ANNULEE: {
    text: "Annulée",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  REMBOURSEE: {
    text: "Remboursée",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
};

const modeLabel: Record<string, string> = {
  ESPECES: "Espèces",
  CARTE_BANCAIRE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  AUTRE: "Autre",
};

export default async function VenteDetailPage({ params }: VenteDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const role = session.user.role as Role;

  const vente = await prisma.vente.findUnique({
    where: { id },
    include: {
      lignes: {
        include: { produit: { select: { id: true, nom: true, reference: true } } },
      },
      paiements: true,
      caissier: { select: { id: true, nom: true, email: true } },
      session: { select: { id: true, ouvertureAt: true, montantOuvertureCash: true, montantOuvertureMobileMoney: true } },
    },
  });

  if (!vente) notFound();

  // CAISSIER can only see their own sales
  if (!hasRole(role, ["ADMIN", "MANAGER"]) && vente.userId !== session.user.id) {
    redirect("/comptoir/ventes");
  }

  const statut = statutStyle[vente.statut] ?? { text: vente.statut, className: "" };
  const canCancel = hasPermission(role, "ventes:annuler") && vente.statut === "VALIDEE";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/comptoir/ventes"
            className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
          >
            ← Retour aux ventes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {vente.numero}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {fmtDate(vente.dateVente)}
          </p>
        </div>
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${statut.className}`}>
          {statut.text}
        </span>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard label="Caissier" value={vente.caissier.nom} />
        <InfoCard label="Session" value={fmtDate(vente.session.ouvertureAt)} />
        <InfoCard label="Total" value={fmt(vente.total)} highlight />
        <InfoCard label="Articles" value={`${vente.lignes.length} ligne${vente.lignes.length > 1 ? "s" : ""}`} />
      </div>

      {/* Lines */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Articles</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 font-medium text-right">P.U.</th>
                <th className="px-4 py-2.5 font-medium text-center">Qté</th>
                <th className="px-4 py-2.5 font-medium text-right">Remise</th>
                <th className="px-4 py-2.5 font-medium text-right">TVA</th>
                <th className="px-4 py-2.5 font-medium text-right">Sous-total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {vente.lignes.map((l) => (
                <tr key={l.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{l.produit.nom}</div>
                    <div className="text-xs text-zinc-400">{l.produit.reference}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">{fmt(l.prixUnitaire)}</td>
                  <td className="px-4 py-2.5 text-center">{l.quantite}</td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(l.remise) > 0 ? `${Number(l.remise)}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(l.tva) > 0 ? `${Number(l.tva)}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmt(l.sousTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
            <span>Sous-total</span>
            <span>{fmt(vente.sousTotal)}</span>
          </div>
          {Number(vente.remise) > 0 && (
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Remise</span>
              <span>-{fmt(vente.remise)}</span>
            </div>
          )}
          {Array.isArray(vente.taxesDetail) && (vente.taxesDetail as { nom: string; taux: number; montant: number }[]).length > 0
            ? (vente.taxesDetail as { nom: string; taux: number; montant: number }[]).map((t) =>
                t.montant > 0 ? (
                  <div key={t.nom} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>{t.nom} ({t.taux}%)</span>
                    <span>{fmt(t.montant)}</span>
                  </div>
                ) : null
              )
            : Number(vente.tva) > 0 ? (
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>TVA</span>
                  <span>{fmt(vente.tva)}</span>
                </div>
              ) : null}
          <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100 pt-1 border-t border-zinc-200 dark:border-zinc-700">
            <span>TOTAL TTC</span>
            <span>{fmt(vente.total)}</span>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Paiements</h2>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {vente.paiements.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
              <div>
                <span className="font-medium">{modeLabel[p.mode] ?? p.mode}</span>
                {p.reference && (
                  <span className="ml-2 text-xs text-zinc-400">Réf: {p.reference}</span>
                )}
              </div>
              <span className="font-medium">{fmt(p.montant)}</span>
            </div>
          ))}
          {vente.paiements.some((p) => p.mode === "ESPECES") && (
            <div className="flex items-center justify-between px-4 py-3 text-sm bg-emerald-50/50 dark:bg-emerald-900/10">
              <span className="text-emerald-700 dark:text-emerald-400">Monnaie rendue</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {fmt(
                  vente.paiements.reduce((s, p) => s + Number(p.montant), 0) - Number(vente.total)
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Client info */}
      {(vente.nomClient || vente.notesCaissier) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Informations</h2>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
            {vente.nomClient && <div><span className="text-zinc-500">Client :</span> {vente.nomClient}</div>}
            {vente.notesCaissier && <div><span className="text-zinc-500">Notes :</span> {vente.notesCaissier}</div>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Link
          href={`/comptoir/tickets/${vente.id}`}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Voir le ticket
        </Link>
        {canCancel && <CancelButtonClient venteId={vente.id} />}
      </div>
    </div>
  );
}

function InfoCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2.5">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${highlight ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}
