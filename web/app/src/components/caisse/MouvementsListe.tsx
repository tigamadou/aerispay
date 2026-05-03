"use client";

import { useCallback, useEffect, useState, useRef } from "react";

interface CaisseInfo {
  id: string;
  nom: string;
}

interface SoldeParMode {
  mode: string;
  solde: number;
}

interface SoldesData {
  caisse: CaisseInfo;
  soldes: SoldeParMode[];
  total: number;
}

interface Mouvement {
  id: string;
  type: string;
  mode: string;
  montant: number;
  motif: string | null;
  reference: string | null;
  createdAt: string;
  auteur: { id: string; nom: string };
  vente: { id: string; numero: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const TYPE_LABELS: Record<string, string> = {
  FOND_INITIAL: "Fond initial",
  VENTE: "Vente",
  REMBOURSEMENT: "Remboursement",
  APPORT: "Apport",
  RETRAIT: "Retrait",
  DEPENSE: "Depense",
  CORRECTION: "Correction",
};

const MODE_LABELS: Record<string, string> = {
  ESPECES: "Cash",
  MOBILE_MONEY: "Mobile Money",
  MOBILE_MONEY_MTN: "MomoPay",
  MOBILE_MONEY_MOOV: "MoovMoney",
  CELTIS_CASH: "Celtis Cash",
};

const TYPE_COLORS: Record<string, string> = {
  FOND_INITIAL: "bg-blue-100 text-blue-800",
  VENTE: "bg-green-100 text-green-800",
  REMBOURSEMENT: "bg-orange-100 text-orange-800",
  APPORT: "bg-emerald-100 text-emerald-800",
  RETRAIT: "bg-red-100 text-red-800",
  DEPENSE: "bg-amber-100 text-amber-800",
  CORRECTION: "bg-purple-100 text-purple-800",
};

const MODE_COLORS: Record<string, string> = {
  ESPECES: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
  MOBILE_MONEY_MTN: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800",
  MOBILE_MONEY_MOOV: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
  CELTIS_CASH: "bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800",
};

export function MouvementsListe() {
  const [caisses, setCaisses] = useState<CaisseInfo[]>([]);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string>("");
  const [soldesData, setSoldesData] = useState<SoldesData | null>(null);
  const [soldesLoading, setSoldesLoading] = useState(true);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"APPORT" | "RETRAIT" | "DEPENSE">("APPORT");
  const [formMode, setFormMode] = useState("ESPECES");
  const [formMontant, setFormMontant] = useState("");
  const [formMotif, setFormMotif] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const initialized = useRef(false);

  // Fetch caisses list on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch("/api/caisse")
      .then((r) => r.json())
      .then((body) => {
        const list = body.data ?? [];
        setCaisses(list);
        if (list.length > 0) {
          setSelectedCaisseId(list[0].id);
        }
      })
      .catch(() => setCaisses([]));
  }, []);

  // Fetch soldes when caisse changes
  const fetchSoldes = useCallback(async () => {
    if (!selectedCaisseId) return;
    setSoldesLoading(true);
    try {
      const res = await fetch(`/api/caisse/${selectedCaisseId}/soldes`);
      if (!res.ok) { setSoldesData(null); return; }
      const body = await res.json();
      setSoldesData(body.data);
    } catch {
      setSoldesData(null);
    } finally {
      setSoldesLoading(false);
    }
  }, [selectedCaisseId]);

  // Fetch mouvements
  const fetchMouvements = useCallback(async (page = 1) => {
    if (!selectedCaisseId) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (typeFilter) params.set("type", typeFilter);
    if (modeFilter) params.set("mode", modeFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    try {
      const res = await fetch(`/api/caisse/${selectedCaisseId}/mouvements?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const body = await res.json();
      setMouvements(body.data);
      setPagination(body.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [selectedCaisseId, typeFilter, modeFilter, fromDate, toDate]);

  useEffect(() => {
    if (!selectedCaisseId) return;
    const load = async () => {
      await Promise.all([fetchSoldes(), fetchMouvements(1)]);
    };
    load();
  }, [selectedCaisseId, fetchSoldes, fetchMouvements]);

  // Submit movement
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCaisseId) return;

    setFormSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await fetch(`/api/caisse/${selectedCaisseId}/mouvements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          mode: formMode,
          montant: parseFloat(formMontant),
          motif: formMotif,
          reference: formReference || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }

      setFormSuccess(`${TYPE_LABELS[formType]} de ${parseFloat(formMontant).toLocaleString("fr-FR")} F enregistre`);
      setFormMontant("");
      setFormMotif("");
      setFormReference("");

      fetchSoldes();
      fetchMouvements(1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setFormSubmitting(false);
    }
  };

  const formatMontant = (montant: number) => {
    const abs = Math.abs(montant);
    const formatted = abs.toLocaleString("fr-FR");
    if (montant < 0) return `-${formatted} F`;
    return `+${formatted} F`;
  };

  if (caisses.length === 0 && !soldesLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Aucune caisse configuree. Contactez un administrateur pour creer une caisse.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Soldes cards */}
      {soldesLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-4 w-20 bg-zinc-200 rounded dark:bg-zinc-700 mb-2" />
              <div className="h-8 w-28 bg-zinc-200 rounded dark:bg-zinc-700" />
            </div>
          ))}
        </div>
      ) : soldesData ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {soldesData.caisse.nom}
              </h2>
              {caisses.length > 1 && (
                <select
                  value={selectedCaisseId}
                  onChange={(e) => setSelectedCaisseId(e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {caisses.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
            >
              {showForm ? "Fermer" : "Nouveau mouvement"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {soldesData.soldes.map((s) => (
              <div
                key={s.mode}
                className={`rounded-lg border p-4 ${MODE_COLORS[s.mode] ?? "bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800"}`}
              >
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {MODE_LABELS[s.mode] ?? s.mode}
                </p>
                <p className={`text-xl font-bold font-mono ${s.solde < 0 ? "text-red-600" : "text-zinc-900 dark:text-zinc-100"}`}>
                  {s.solde.toLocaleString("fr-FR")} F
                </p>
              </div>
            ))}
            <div className="rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total</p>
              <p className={`text-xl font-bold font-mono ${soldesData.total < 0 ? "text-red-600" : "text-zinc-900 dark:text-zinc-100"}`}>
                {soldesData.total.toLocaleString("fr-FR")} F
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Movement creation form */}
      {showForm && selectedCaisseId && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            Nouveau mouvement
          </h3>

          {formError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="mb-3 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as "APPORT" | "RETRAIT" | "DEPENSE")}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="APPORT">Apport</option>
                <option value="RETRAIT">Retrait</option>
                <option value="DEPENSE">Depense</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Mode</label>
              <select
                value={formMode}
                onChange={(e) => setFormMode(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {Object.entries(MODE_LABELS).filter(([k]) => k !== "MOBILE_MONEY").map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Montant (FCFA)</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={formMontant}
                onChange={(e) => setFormMontant(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Motif</label>
              <input
                type="text"
                required
                maxLength={500}
                value={formMotif}
                onChange={(e) => setFormMotif(e.target.value)}
                placeholder="Raison du mouvement"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Reference</label>
              <input
                type="text"
                maxLength={100}
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                placeholder="Optionnel"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={formSubmitting || !formMontant || !formMotif}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {formSubmitting ? "Envoi..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            <option value="">Tous</option>
            {Object.entries(TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Mode</label>
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            <option value="">Tous</option>
            {Object.entries(MODE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Du</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Au</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
        </div>
        <button onClick={() => { setTypeFilter(""); setModeFilter(""); setFromDate(""); setToDate(""); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
          Reinitialiser
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Date</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Type</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Mode</th>
              <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">Montant</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Motif</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Auteur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Chargement...</td></tr>
            ) : mouvements.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Aucun mouvement</td></tr>
            ) : (
              mouvements.map((m) => (
                <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[m.type] ?? "bg-zinc-100 text-zinc-600"}`}>
                      {TYPE_LABELS[m.type] ?? m.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{MODE_LABELS[m.mode] ?? m.mode}</td>
                  <td className={`px-4 py-2 text-right font-mono font-medium whitespace-nowrap ${Number(m.montant) < 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatMontant(Number(m.montant))}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">
                    {m.vente ? <span className="text-indigo-600">Vente {m.vente.numero}</span> : m.motif ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{m.auteur.nom}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-zinc-500 dark:text-zinc-400">
            {pagination.total} mouvement{pagination.total > 1 ? "s" : ""} — page {pagination.page}/{pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button disabled={pagination.page <= 1} onClick={() => fetchMouvements(pagination.page - 1)}
              className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Precedent
            </button>
            <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchMouvements(pagination.page + 1)}
              className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
