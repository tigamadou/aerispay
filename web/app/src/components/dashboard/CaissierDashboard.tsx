"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatMontant } from "@/lib/utils";

type Period = "day" | "week" | "month" | "custom";

interface KpiData {
  period: Period;
  dateFrom: string;
  dateTo: string;
  revenue: number;
  salesCount: number;
  averageBasket: number;
  cashTotal: number;
  nonCashTotal: number;
  openSession: { id: string; ouvertureAt: string; montantOuverture: number } | null;
  peripherals: {
    printer: { enabled: boolean; type: string; interface: string };
    cashDrawer: { enabled: boolean; mode: string };
  };
}

interface CaissierDashboardProps {
  userName: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  day: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
  custom: "Personnalise",
};

export function CaissierDashboard({ userName }: CaissierDashboardProps) {
  const [period, setPeriod] = useState<Period>("day");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (period === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    } else {
      params.set("period", period);
    }

    try {
      const res = await fetch(`/api/dashboard/kpis?${params.toString()}`);
      if (!res.ok) {
        setError("Impossible de charger les indicateurs");
        return;
      }
      const body = await res.json();
      setData(body.data);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Bonjour, {userName}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Link
          href="/caisse"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 shrink-0"
        >
          Ouvrir la caisse
        </Link>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => setPeriod("custom")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              period === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            Periode
          </button>
        </div>

        {period === "custom" && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-zinc-500 dark:text-zinc-400">Du</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-zinc-500 dark:text-zinc-400">Au</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-400">
          Chargement...
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* KPIs */}
      {data && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={`CA ${PERIOD_LABELS[data.period].toLowerCase()}`}
              value={formatMontant(data.revenue)}
            />
            <KpiCard
              label="Ventes"
              value={String(data.salesCount)}
            />
            <KpiCard
              label="Panier moyen"
              value={data.salesCount > 0 ? formatMontant(data.averageBasket) : "N/A"}
            />
            <KpiCard
              label="Especes"
              value={formatMontant(data.cashTotal)}
              sub={`Autres: ${formatMontant(data.nonCashTotal)}`}
            />
          </div>

          {/* Session info */}
          {data.openSession && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/10">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Session de caisse ouverte
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Depuis {new Date(data.openSession.ouvertureAt).toLocaleString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })} — Fond de caisse: {formatMontant(data.openSession.montantOuverture)}
              </p>
            </div>
          )}

          {/* Peripherals */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Peripheriques
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <PeripheralCard
                label="Imprimante ticket"
                enabled={data.peripherals.printer.enabled}
                details={data.peripherals.printer.enabled
                  ? `${data.peripherals.printer.type} — ${data.peripherals.printer.interface}`
                  : "Desactivee"}
              />
              <PeripheralCard
                label="Tiroir-caisse"
                enabled={data.peripherals.cashDrawer.enabled}
                details={data.peripherals.cashDrawer.enabled
                  ? `Mode: ${data.peripherals.cashDrawer.mode}`
                  : "Desactive"}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function PeripheralCard({ label, enabled, details }: { label: string; enabled: boolean; details: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${
      enabled
        ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10"
        : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50"
    }`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        enabled
          ? "bg-emerald-100 dark:bg-emerald-900/30"
          : "bg-zinc-200 dark:bg-zinc-700"
      }`}>
        {enabled ? (
          <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <div>
        <p className={`text-sm font-medium ${
          enabled ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-500 dark:text-zinc-400"
        }`}>
          {label}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{details}</p>
      </div>
    </div>
  );
}
