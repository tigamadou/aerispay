import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime, formatMontant } from "@/lib/utils";
import Link from "next/link";
import type { Role } from "@prisma/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detail du journal",
};

const actionLabels: Record<string, { label: string; classes: string }> = {
  AUTH_LOGIN_SUCCESS: { label: "Connexion reussie", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  AUTH_LOGIN_FAILED: { label: "Echec de connexion", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  AUTH_LOGOUT: { label: "Deconnexion", classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  USER_CREATED: { label: "Utilisateur cree", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  USER_UPDATED: { label: "Utilisateur modifie", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  USER_DEACTIVATED: { label: "Utilisateur desactive", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  PRODUCT_CREATED: { label: "Produit cree", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  PRODUCT_UPDATED: { label: "Produit modifie", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  PRODUCT_DEACTIVATED: { label: "Produit desactive", classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  CATEGORY_CREATED: { label: "Categorie creee", classes: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  CATEGORY_UPDATED: { label: "Categorie modifiee", classes: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  CATEGORY_DELETED: { label: "Categorie supprimee", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  STOCK_MOVEMENT_CREATED: { label: "Mouvement de stock", classes: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  CASH_SESSION_OPENED: { label: "Session de caisse ouverte", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  CASH_SESSION_CLOSED: { label: "Session de caisse fermee", classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  SALE_COMPLETED: { label: "Vente enregistree", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  SALE_CANCELLED: { label: "Vente annulee", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  TICKET_PDF_DOWNLOADED: { label: "PDF telecharge", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  TICKET_THERMAL_PRINT_REQUESTED: { label: "Impression thermique", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  CASH_DRAWER_OPENED: { label: "Tiroir-caisse ouvert", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  CASH_DRAWER_OPEN_FAILED: { label: "Echec tiroir-caisse", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  PARAMETRES_UPDATED: { label: "Parametres modifies", classes: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
};

const entityLinks: Record<string, (id: string) => string> = {
  Product: (id) => `/stock/${id}`,
  Category: () => "/stock/categories",
  StockMovement: () => "/stock/mouvements",
  User: (id) => `/users`,
  Sale: (id) => `/caisse/tickets/${id}`,
  CashSession: () => "/caisse/sessions",
};

const modeLabels: Record<string, string> = {
  ESPECES: "Especes",
  CARTE_BANCAIRE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  VIREMENT: "Virement",
  AUTRE: "Autre",
};

interface ActivityLogDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ActivityLogDetailPage({ params }: ActivityLogDetailPageProps) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "activity_logs:consulter")) {
    redirect("/");
  }

  const { id } = await params;
  const isAdmin = session.user.role === "ADMIN";

  const log = await prisma.activityLog.findUnique({
    where: { id },
    include: {
      actor: { select: { id: true, nom: true, email: true, role: true } },
    },
  });

  if (!log) notFound();

  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const info = actionLabels[log.action] ?? { label: log.action, classes: "bg-zinc-100 text-zinc-700" };
  const entityHref = log.entityType && log.entityId && entityLinks[log.entityType]
    ? entityLinks[log.entityType](log.entityId)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back */}
      <Link
        href="/activity-logs"
        className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Retour au journal
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${info.classes}`}>
            {info.label}
          </span>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {formatDateTime(log.createdAt.toISOString())}
          </p>
        </div>
        <span className="font-mono text-xs text-zinc-400">{log.id}</span>
      </div>

      {/* Actor */}
      <Section title="Acteur">
        {log.actor ? (
          <div className="space-y-1">
            <Row label="Nom" value={log.actor.nom} />
            <Row label="Email" value={log.actor.email} />
            <Row label="Role" value={log.actor.role} />
          </div>
        ) : (
          <p className="text-sm italic text-zinc-400">Systeme</p>
        )}
      </Section>

      {/* Entity */}
      {log.entityType && (
        <Section title="Entite concernee">
          <div className="space-y-1">
            <Row label="Type" value={log.entityType} />
            {log.entityId && <Row label="ID" value={log.entityId} mono />}
            {entityHref && (
              <div className="pt-1">
                <Link href={entityHref} className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                  Voir l{"'"}entite →
                </Link>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Metadata */}
      {Object.keys(meta).length > 0 && (
        <Section title="Details de l'action">
          <MetadataView meta={meta} action={log.action} />
        </Section>
      )}

      {/* Technical info (ADMIN only) */}
      {isAdmin && (
        <Section title="Informations techniques">
          <div className="space-y-1">
            <Row label="Adresse IP" value={log.ipAddress ?? "-"} mono />
            <Row label="User-Agent" value={log.userAgent ?? "-"} small />
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="w-32 shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`text-sm text-zinc-900 dark:text-zinc-100 ${mono ? "font-mono" : ""} ${small ? "text-xs break-all" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function MetadataView({ meta, action }: { meta: Record<string, unknown>; action: string }) {
  // Sale-specific rendering
  if ((action === "SALE_COMPLETED" || action === "SALE_CANCELLED") && meta.numero) {
    return <SaleMetadata meta={meta} />;
  }

  // Stock movement rendering
  if (action === "STOCK_MOVEMENT_CREATED") {
    return <StockMovementMetadata meta={meta} />;
  }

  // Cash session rendering
  if (action === "CASH_SESSION_CLOSED" || action === "CASH_SESSION_OPENED") {
    return <CashSessionMetadata meta={meta} />;
  }

  // Default: render all key-value pairs
  return <GenericMetadata meta={meta} />;
}

function SaleMetadata({ meta }: { meta: Record<string, unknown> }) {
  const lignes = Array.isArray(meta.lignes) ? meta.lignes : [];
  const paiements = Array.isArray(meta.paiements) ? meta.paiements : [];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {meta.numero ? <Row label="N° vente" value={String(meta.numero)} mono /> : null}
        {meta.dateVente ? <Row label="Date vente" value={formatDateTime(String(meta.dateVente))} /> : null}
        {meta.sessionId ? <Row label="Session" value={String(meta.sessionId)} mono /> : null}
      </div>

      {/* Totals */}
      <div className="space-y-1 rounded-md bg-zinc-50 p-3 dark:bg-zinc-800/50">
        {meta.sousTotal != null && <Row label="Sous-total" value={formatMontant(Number(meta.sousTotal))} />}
        {Number(meta.remise) > 0 && <Row label="Remise" value={`-${formatMontant(Number(meta.remise))}`} />}
        {Number(meta.tva) > 0 && <Row label="TVA" value={formatMontant(Number(meta.tva))} />}
        {meta.total != null && <Row label="Total TTC" value={formatMontant(Number(meta.total))} />}
        {meta.nbArticles != null && <Row label="Nb articles" value={String(meta.nbArticles)} />}
      </div>

      {/* Lines */}
      {lignes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Articles</p>
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Produit</th>
                  <th className="px-3 py-2 text-right font-medium">Qte</th>
                  <th className="px-3 py-2 text-right font-medium">PU</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {lignes.map((l: Record<string, unknown>, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{String(l.produitNom ?? l.produitId ?? "-")}</td>
                    <td className="px-3 py-2 text-right">{String(l.quantite ?? "-")}</td>
                    <td className="px-3 py-2 text-right">{l.prixUnitaire != null ? formatMontant(Number(l.prixUnitaire)) : "-"}</td>
                    <td className="px-3 py-2 text-right font-medium">{l.sousTotal != null ? formatMontant(Number(l.sousTotal)) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments */}
      {paiements.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Paiements</p>
          <div className="space-y-1">
            {paiements.map((p: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {modeLabels[String(p.mode)] ?? String(p.mode)}
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {formatMontant(Number(p.montant))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining fields */}
      <GenericMetadata meta={meta} exclude={["numero", "dateVente", "sessionId", "sousTotal", "remise", "tva", "total", "nbArticles", "lignes", "paiements", "nbArticlesRestaures"]} />
      {meta.nbArticlesRestaures != null && <Row label="Articles restaures" value={String(meta.nbArticlesRestaures)} />}
    </div>
  );
}

function StockMovementMetadata({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      {meta.produitNom ? <Row label="Produit" value={String(meta.produitNom)} /> : null}
      {meta.produitId ? <Row label="ID produit" value={String(meta.produitId)} mono /> : null}
      {meta.type ? <Row label="Type" value={String(meta.type)} /> : null}
      {meta.quantite != null && <Row label="Quantite" value={String(meta.quantite)} />}
      {meta.quantiteAvant != null && <Row label="Stock avant" value={String(meta.quantiteAvant)} />}
      {meta.quantiteApres != null && <Row label="Stock apres" value={String(meta.quantiteApres)} />}
      <GenericMetadata meta={meta} exclude={["produitNom", "produitId", "type", "quantite", "quantiteAvant", "quantiteApres"]} />
    </div>
  );
}

function CashSessionMetadata({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      {meta.ouvertureAt ? <Row label="Ouverture" value={formatDateTime(String(meta.ouvertureAt))} /> : null}
      {meta.fermetureAt ? <Row label="Fermeture" value={formatDateTime(String(meta.fermetureAt))} /> : null}
      {meta.montantOuverture != null && <Row label="Fond de caisse" value={formatMontant(Number(meta.montantOuverture))} />}
      {meta.montantFermeture != null && <Row label="Montant fermeture" value={formatMontant(Number(meta.montantFermeture))} />}
      {meta.soldeTheorique != null && <Row label="Solde theorique" value={formatMontant(Number(meta.soldeTheorique))} />}
      {meta.ecartCaisse != null && <Row label="Ecart caisse" value={formatMontant(Number(meta.ecartCaisse))} />}
      {meta.nbVentes != null && <Row label="Nb ventes" value={String(meta.nbVentes)} />}
      {meta.caTotal != null && <Row label="CA session" value={formatMontant(Number(meta.caTotal))} />}
      {meta.closedByOwner != null && <Row label="Ferme par le proprietaire" value={meta.closedByOwner ? "Oui" : "Non"} />}
      <GenericMetadata meta={meta} exclude={["ouvertureAt", "fermetureAt", "montantOuverture", "montantFermeture", "soldeTheorique", "ecartCaisse", "nbVentes", "caTotal", "closedByOwner"]} />
    </div>
  );
}

function GenericMetadata({ meta, exclude = [] }: { meta: Record<string, unknown>; exclude?: string[] }) {
  const entries = Object.entries(meta).filter(
    ([key, val]) => !exclude.includes(key) && val !== undefined && val !== null
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      {entries.map(([key, val]) => {
        if (typeof val === "object" && !Array.isArray(val)) {
          return (
            <div key={key} className="pt-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</span>
              <pre className="mt-1 rounded-md bg-zinc-50 p-2 text-xs text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300 overflow-x-auto">
                {JSON.stringify(val, null, 2)}
              </pre>
            </div>
          );
        }
        if (Array.isArray(val)) {
          return (
            <div key={key} className="pt-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</span>
              <pre className="mt-1 rounded-md bg-zinc-50 p-2 text-xs text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300 overflow-x-auto">
                {JSON.stringify(val, null, 2)}
              </pre>
            </div>
          );
        }
        return <Row key={key} label={key} value={String(val)} />;
      })}
    </div>
  );
}
