import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission, hasRole } from "@/lib/permissions";
import type { Role, Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { CancelButtonClient } from "@/components/comptoir/CancelButton";
import { VenteFilterDateClient } from "@/components/comptoir/VenteFilterDate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historique des ventes",
};

interface VentesPageProps {
  searchParams: Promise<{
    page?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    session?: string; // "all" to show all sessions for caissier
  }>;
}

function fmt(montant: number | string | { toString(): string }): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(Number(montant))).replace(/\u202F/g, " ")} FCFA`;
}

const statutLabel: Record<string, { text: string; className: string }> = {
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
  CARTE_BANCAIRE: "Carte",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  AUTRE: "Autre",
};

export default async function VentesPage({ searchParams }: VentesPageProps) {
  const authSession = await auth();
  if (!authSession?.user) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 20;
  const role = authSession.user.role as Role;
  const canCancel = hasPermission(role, "ventes:annuler");
  const isManager = hasRole(role, ["ADMIN", "MANAGER"]);
  const isCaissier = role === "CAISSIER";

  // ─── Find caissier's open session ──────────────────
  const openSession = isCaissier
    ? await prisma.comptoirSession.findFirst({
        where: { userId: authSession.user.id, statut: "OUVERTE" },
        select: { id: true, ouvertureAt: true, montantOuvertureCash: true, montantOuvertureMobileMoney: true },
      })
    : null;

  const showCurrentSession = isCaissier && !params.dateFrom && !params.dateTo && params.session !== "all";

  // ─── Build where clause ────────────────────────────
  const where: Prisma.VenteWhereInput = {};

  if (isCaissier) {
    where.userId = authSession.user.id;
    if (showCurrentSession && openSession) {
      where.sessionId = openSession.id;
    }
  } else if (isManager) {
    if (params.userId) where.userId = params.userId;
  }

  if (params.dateFrom || params.dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom);
    if (params.dateTo) {
      const to = new Date(params.dateTo);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    where.dateVente = dateFilter;
  }

  // ─── Fetch caissiers for manager filter ────────────
  const caissiers = isManager
    ? await prisma.user.findMany({
        where: { role: "CAISSIER", actif: true },
        select: { id: true, nom: true },
        orderBy: { nom: "asc" },
      })
    : [];

  // ─── Fetch ventes + count ──────────────────────────
  const [ventes, total] = await Promise.all([
    prisma.vente.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { dateVente: "desc" },
      include: {
        caissier: { select: { nom: true } },
        paiements: { select: { mode: true, montant: true } },
        _count: { select: { lignes: true } },
      },
    }),
    prisma.vente.count({ where }),
  ]);

  // ─── KPIs ──────────────────────────────────────────
  const kpiWhere = { ...where, statut: "VALIDEE" as const };

  const [kpiAgg, kpiCount] = await Promise.all([
    prisma.vente.aggregate({
      where: kpiWhere,
      _sum: { total: true },
      _avg: { total: true },
    }),
    prisma.vente.count({ where: kpiWhere }),
  ]);

  // Payment breakdown
  const paiementsAgg = await prisma.paiement.groupBy({
    by: ["mode"],
    where: { vente: kpiWhere },
    _sum: { montant: true },
  });

  const caTotal = Number(kpiAgg._sum.total ?? 0);
  const panierMoyen = Number(kpiAgg._avg.total ?? 0);
  const especesTotal = paiementsAgg
    .filter((p) => p.mode === "ESPECES")
    .reduce((s, p) => s + Number(p._sum.montant ?? 0), 0);
  const autreTotal = caTotal > 0 ? caTotal - especesTotal : 0;

  const totalPages = Math.ceil(total / pageSize);

  // ─── Filter URL builder ────────────────────────────
  function filterUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = {
      userId: params.userId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      session: params.session,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `/comptoir/ventes${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {isCaissier
            ? showCurrentSession && openSession
              ? "Ventes — Session en cours"
              : "Mes ventes"
            : "Historique des ventes"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {total} vente{total > 1 ? "s" : ""} enregistrée{total > 1 ? "s" : ""}
          {showCurrentSession && openSession && (
            <span>
              {" "}· session ouverte le{" "}
              {new Date(openSession.ouvertureAt).toLocaleString("fr-FR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          )}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Chiffre d'affaires" value={fmt(caTotal)} />
        <KpiCard label="Ventes" value={String(kpiCount)} />
        <KpiCard label="Panier moyen" value={fmt(panierMoyen)} />
        <KpiCard
          label="Espèces / Autre"
          value={`${fmt(especesTotal)} / ${fmt(autreTotal)}`}
          small
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        {/* CAISSIER: session toggle + date */}
        {isCaissier && (
          <>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Période</label>
              <div className="flex gap-1">
                <Link
                  href="/comptoir/ventes"
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    showCurrentSession
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                  }`}
                >
                  Session en cours
                </Link>
                <Link
                  href="/comptoir/ventes?session=all"
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    params.session === "all" && !params.dateFrom && !params.dateTo
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                  }`}
                >
                  Toutes
                </Link>
              </div>
            </div>
          </>
        )}

        {/* ADMIN/MANAGER: caissier filter */}
        {isManager && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Caissier</label>
            <VenteFilterSelect
              name="userId"
              value={params.userId}
              options={[{ value: "", label: "Tous" }, ...caissiers.map((c) => ({ value: c.id, label: c.nom }))]}
              filterUrl={filterUrl}
            />
          </div>
        )}

        {/* Date filters (all roles) */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Du</label>
          <VenteFilterDate name="dateFrom" value={params.dateFrom} filterUrl={filterUrl} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Au</label>
          <VenteFilterDate name="dateTo" value={params.dateTo} filterUrl={filterUrl} />
        </div>

        {(params.userId || params.dateFrom || params.dateTo || params.session) && (
          <Link
            href="/comptoir/ventes"
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Réinitialiser
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Date</th>
              {isManager && <th className="px-4 py-3 font-medium">Caissier</th>}
              <th className="px-4 py-3 font-medium">Articles</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Paiement</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {ventes.map((v) => {
              const statut = statutLabel[v.statut] ?? { text: v.statut, className: "" };
              return (
                <tr key={v.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/comptoir/ventes/${v.id}`} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                      {v.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(v.dateVente).toLocaleString("fr-FR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  {isManager && <td className="px-4 py-3">{v.caissier.nom}</td>}
                  <td className="px-4 py-3">{v._count.lignes}</td>
                  <td className="px-4 py-3 font-medium">{fmt(v.total)}</td>
                  <td className="px-4 py-3">
                    {v.paiements.map((p) => modeLabel[p.mode] ?? p.mode).join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statut.className}`}>
                      {statut.text}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/comptoir/tickets/${v.id}`}
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-xs font-medium"
                      >
                        Ticket
                      </Link>
                      {canCancel && v.statut === "VALIDEE" && (
                        <CancelButton venteId={v.id} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {ventes.length === 0 && (
              <tr>
                <td colSpan={isManager ? 8 : 7} className="px-4 py-8 text-center text-zinc-400">
                  Aucune vente enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>Page {page} sur {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={filterUrl({ page: String(page - 1) })} className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link href={filterUrl({ page: String(page + 1) })} className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────

function CancelButton({ venteId }: { venteId: string }) {
  return <CancelButtonClient venteId={venteId} />;
}

function KpiCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2.5">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 font-semibold text-zinc-900 dark:text-zinc-100 ${small ? "text-sm" : "text-lg"}`}>
        {value}
      </div>
    </div>
  );
}

function VenteFilterSelect({
  name,
  value,
  options,
  filterUrl,
}: {
  name: string;
  value?: string;
  options: { value: string; label: string }[];
  filterUrl: (overrides: Record<string, string | undefined>) => string;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => {
        const active = (value ?? "") === opt.value;
        return (
          <Link
            key={opt.value}
            href={filterUrl({ [name]: opt.value || undefined, page: undefined })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-indigo-600 text-white"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

function VenteFilterDate({
  name,
  value,
}: {
  name: string;
  value?: string;
  filterUrl: (overrides: Record<string, string | undefined>) => string;
}) {
  return <VenteFilterDateClient name={name} value={value} />;
}
