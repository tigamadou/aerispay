import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TicketActions } from "@/components/comptoir/TicketActions";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ticket de comptoir",
};

const modeLabel: Record<string, string> = {
  ESPECES: "Cash",
  MOBILE_MONEY: "Mobile Money",
  MOBILE_MONEY_MTN: "MomoPay",
  MOBILE_MONEY_MOOV: "MoovMoney",
  CELTIS_CASH: "Celtis Cash",
};

const statutLabel: Record<string, { text: string; className: string }> = {
  VALIDEE: {
    text: "Validee",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  ANNULEE: {
    text: "Annulee",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  REMBOURSEE: {
    text: "Remboursee",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
};

function fmt(montant: number | string | { toString(): string }): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(Number(montant))).replace(/\u202F/g, " ")} FCFA`;
}

interface TicketPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketPage({ params }: TicketPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const vente = await prisma.vente.findUnique({
    where: { id },
    include: {
      lignes: {
        include: { produit: { select: { id: true, nom: true, reference: true } } },
      },
      paiements: true,
      caissier: { select: { id: true, nom: true, email: true } },
      session: { select: { id: true, ouvertureAt: true } },
    },
  });

  if (!vente) notFound();

  const sousTotal = Number(vente.sousTotal);
  const remise = Number(vente.remise);
  const tva = Number(vente.tva);
  const taxesDetail = Array.isArray(vente.taxesDetail)
    ? (vente.taxesDetail as { nom: string; taux: number; montant: number }[])
    : null;
  const total = Number(vente.total);
  const statut = statutLabel[vente.statut] ?? { text: vente.statut, className: "" };

  const parametres = await prisma.parametres.findUnique({ where: { id: "default" } });
  const commerceNom = parametres?.nomCommerce || "AerisPay";
  const commerceAdresse = parametres?.adresse ?? "";
  const commerceTel = parametres?.telephone ?? "";
  const commerceRccm = parametres?.rccm ?? "";
  const commerceNif = parametres?.nif ?? "";
  const commerceLogo = parametres?.logo ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/comptoir/ventes"
          className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Retour aux ventes
        </Link>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statut.className}`}>
          {statut.text}
        </span>
      </div>

      {/* Ticket Preview */}
      <div className="rounded-xl border border-zinc-200 bg-white font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800">
        {/* Header */}
        <div className="border-b border-dashed border-zinc-300 px-6 py-5 text-center dark:border-zinc-600">
          {commerceLogo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={commerceLogo}
              alt={commerceNom}
              className="mx-auto mb-3 h-16 w-auto object-contain"
            />
          )}
          <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{commerceNom}</p>
          {commerceAdresse && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{commerceAdresse}</p>
          )}
          {commerceTel && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Tel: {commerceTel}</p>
          )}
          {(commerceRccm || commerceNif) && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {commerceRccm && `RCCM: ${commerceRccm}`}
              {commerceRccm && commerceNif && " | "}
              {commerceNif && `NIF: ${commerceNif}`}
            </p>
          )}
        </div>

        {/* Sale info */}
        <div className="border-b border-dashed border-zinc-300 px-6 py-3 dark:border-zinc-600">
          <div className="flex justify-between text-zinc-700 dark:text-zinc-300">
            <span>Ticket N°:</span>
            <span className="font-semibold">{vente.numero}</span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
            <span>Date:</span>
            <span>
              {new Date(vente.dateVente).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
            <span>Caissier:</span>
            <span>{vente.caissier.nom}</span>
          </div>
        </div>

        {/* Line items */}
        <div className="border-b border-dashed border-zinc-300 px-6 py-3 dark:border-zinc-600">
          {/* Column headers */}
          <div className="mb-2 flex text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            <span className="flex-1">Designation</span>
            <span className="w-10 text-right">Qte</span>
            <span className="w-20 text-right">PU</span>
            <span className="w-24 text-right">Total</span>
          </div>
          <div className="divide-y divide-dotted divide-zinc-200 dark:divide-zinc-700">
            {vente.lignes.map((ligne) => (
              <div key={ligne.id} className="flex items-start py-1.5 text-zinc-700 dark:text-zinc-300">
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{ligne.produit.nom}</span>
                  <span className="text-xs text-zinc-400">{ligne.produit.reference}</span>
                </div>
                <span className="w-10 text-right">{ligne.quantite}</span>
                <span className="w-20 text-right">{fmt(ligne.prixUnitaire)}</span>
                <span className="w-24 text-right font-medium">{fmt(ligne.sousTotal)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="border-b border-dashed border-zinc-300 px-6 py-3 dark:border-zinc-600">
          <div className="space-y-1">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Sous-total</span>
              <span>{fmt(sousTotal)}</span>
            </div>
            {remise > 0 && (
              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                <span>Remise</span>
                <span>-{fmt(remise)}</span>
              </div>
            )}
            {taxesDetail && taxesDetail.length > 0
              ? taxesDetail.map((t) =>
                  t.montant > 0 ? (
                    <div key={t.nom} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>{t.nom} ({t.taux}%)</span>
                      <span>{fmt(t.montant)}</span>
                    </div>
                  ) : null
                )
              : tva > 0 ? (
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>TVA</span>
                    <span>{fmt(tva)}</span>
                  </div>
                ) : null}
            <div className="flex justify-between border-t border-double border-zinc-400 pt-2 text-lg font-bold text-zinc-900 dark:border-zinc-500 dark:text-zinc-100">
              <span>TOTAL TTC</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className="border-b border-dashed border-zinc-300 px-6 py-3 dark:border-zinc-600">
          {vente.paiements.map((p) => {
            const montant = Number(p.montant);
            return (
              <div key={p.id} className="space-y-1">
                <div className="flex justify-between text-zinc-700 dark:text-zinc-300">
                  <span>Mode: {modeLabel[p.mode] ?? p.mode}</span>
                </div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Recu</span>
                  <span>{fmt(montant)}</span>
                </div>
                {p.mode === "ESPECES" && montant > total && (
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Monnaie</span>
                    <span>{fmt(montant - total)}</span>
                  </div>
                )}
                {p.reference && (
                  <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                    <span>Ref:</span>
                    <span>{p.reference}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          <p>Merci de votre confiance !</p>
          <p>Conservez ce ticket svp.</p>
          <p className="mt-1">Emis par AerisPay</p>
        </div>
      </div>

      {/* Actions */}
      <TicketActions venteId={vente.id} />
    </div>
  );
}
