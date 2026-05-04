"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────

interface SerializedComptoirSession {
  id: string;
  ouvertureAt: string;
  fermetureAt: string | null;
  montantOuvertureCash: string;
  montantOuvertureMobileMoney: string;
  montantFermetureCash: string | null;
  montantFermetureMobileMoney: string | null;
  soldeTheoriqueCash: number | null;
  soldeTheoriqueMobileMoney: number | null;
  statut: "OUVERTE" | "FERMEE";
  notes: string | null;
  userId: string;
  _count?: { ventes: number };
  _sum?: { total: string | null };
}

interface ModePaiementOption {
  code: string;
  label: string;
}

interface SessionManagerProps {
  initialSession: SerializedComptoirSession | null;
}

interface RecapRow {
  key: string;
  label: string;
  sign: string;
  useVentesParMode?: boolean;
  useFondOuverture?: boolean;
}

const RECAP_ROWS: RecapRow[] = [
  { key: "FOND_OUVERTURE", label: "Fond de caisse (declare)", sign: "+", useFondOuverture: true },
  { key: "VENTE", label: "Ventes", sign: "+", useVentesParMode: true },
  { key: "APPORT", label: "Apports", sign: "+" },
  { key: "REMBOURSEMENT", label: "Remboursements", sign: "-" },
  { key: "RETRAIT", label: "Retraits", sign: "-" },
  { key: "DEPENSE", label: "Depenses", sign: "-" },
  { key: "CORRECTION", label: "Corrections", sign: "" },
];

// ── Helpers ────────────────────────────────────────────

function formatFCFA(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${new Intl.NumberFormat("fr-FR").format(num).replace(/\u202F/g, " ")} FCFA`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Component ──────────────────────────────────────────

export function SessionManager({ initialSession }: SessionManagerProps) {
  const [session, setSession] = useState<SerializedComptoirSession | null>(initialSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{
    message: string;
    soldeCaisseCash: number;
    soldeCaisseAutres: number;
    ecartCash: number;
    ecartAutres: number;
  } | null>(null);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  const [pendingEcarts, setPendingEcarts] = useState<Array<{ mode: string; ecart: number }>>([]);

  // Dynamic payment modes
  const [modesPaiement, setModesPaiement] = useState<ModePaiementOption[]>([]);
  const modesInitialized = useRef(false);

  // Ouverture: montant par mode { code: "valeur" }
  const [montantsOuverture, setMontantsOuverture] = useState<Record<string, string>>({});

  // Fermeture: montant par mode
  const [montantsFermeture, setMontantsFermeture] = useState<Record<string, string>>({});
  const [notesFermeture, setNotesFermeture] = useState("");

  // Recap détaillé par mode (pour la fermeture)
  const [recapParMode, setRecapParMode] = useState<Record<string, Record<string, number>>>({});
  const [ventesParMode, setVentesParMode] = useState<Record<string, number>>({});
  const [fondOuverture, setFondOuverture] = useState<{ cash: number; autres: number }>({ cash: 0, autres: 0 });
  const [montantAttenduCash, setMontantAttenduCash] = useState(0);
  const [montantAttenduAutres, setMontantAttenduAutres] = useState(0);

  // Fetch payment modes on mount
  useEffect(() => {
    if (modesInitialized.current) return;
    modesInitialized.current = true;

    fetch("/api/parametres/modes-paiement")
      .then((r) => r.json())
      .then((body) => {
        const modes: ModePaiementOption[] = body.data ?? [];
        setModesPaiement(modes);
      })
      .catch(() => {});
  }, []);

  // Fetch session details when opening close form
  useEffect(() => {
    if (!showCloseForm || !session) return;
    let cancelled = false;
    fetch(`/api/comptoir/sessions/${session.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;

        if (json.data?.recapParMode) {
          setRecapParMode(json.data.recapParMode);
        }
        if (json.data?.ventesParMode) {
          setVentesParMode(json.data.ventesParMode);
        }
        if (json.data?.fondOuverture) {
          setFondOuverture({
            cash: json.data.fondOuverture.cash ?? 0,
            autres: json.data.fondOuverture.autres ?? 0,
          });
        }
        if (json.data?.montantAttenduCash != null) {
          setMontantAttenduCash(Number(json.data.montantAttenduCash));
        }
        if (json.data?.montantAttenduAutres != null) {
          setMontantAttenduAutres(Number(json.data.montantAttenduAutres));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showCloseForm, session]);

  // ── Open session ──

  const handleOpen = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // Validate all amounts
      for (const mode of modesPaiement) {
        const val = parseFloat(montantsOuverture[mode.code] || "0");
        if (isNaN(val) || val < 0) {
          setError(`Montant invalide pour ${mode.label}.`);
          return;
        }
      }

      const cashAmount = parseFloat(montantsOuverture.ESPECES || "0");
      const mobileMoneyAmount = modesPaiement
        .filter((m) => m.code !== "ESPECES")
        .reduce((sum, m) => sum + parseFloat(montantsOuverture[m.code] || "0"), 0);

      setLoading(true);
      try {
        const res = await fetch("/api/comptoir/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            montantOuvertureCash: cashAmount,
            montantOuvertureMobileMoney: mobileMoneyAmount,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Erreur lors de l'ouverture de la session.");
          return;
        }

        setSession(json.data);
        setMontantsOuverture({});

        if (json.warning) {
          setWarning(json.warning);
        }
      } catch {
        setError("Erreur reseau. Veuillez reessayer.");
      } finally {
        setLoading(false);
      }
    },
    [montantsOuverture, modesPaiement],
  );

  // ── Close session ──

  // Actually submit the close request
  const submitClose = useCallback(
    async () => {
      if (!session) return;
      setShowDiscrepancyModal(false);
      setError(null);

      const cashAmount = parseFloat(montantsFermeture.ESPECES || "0");
      const mobileMoneyAmount = modesPaiement
        .filter((m) => m.code !== "ESPECES")
        .reduce((sum, m) => sum + parseFloat(montantsFermeture[m.code] || "0"), 0);

      setLoading(true);
      try {
        const res = await fetch(`/api/comptoir/sessions/${session.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            montantFermetureCash: cashAmount,
            montantFermetureMobileMoney: mobileMoneyAmount,
            ...(notesFermeture.trim() ? { notes: notesFermeture.trim() } : {}),
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Erreur lors de la fermeture de la session.");
          return;
        }

        setSession(null);
        setMontantsFermeture({});
        setNotesFermeture("");
        setShowCloseForm(false);
      } catch {
        setError("Erreur reseau. Veuillez reessayer.");
      } finally {
        setLoading(false);
      }
    },
    [session, montantsFermeture, modesPaiement, notesFermeture],
  );

  // Check for discrepancies, show modal if any, otherwise submit directly
  const handleClose = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!session) return;
      setError(null);

      for (const mode of modesPaiement) {
        const val = parseFloat(montantsFermeture[mode.code] || "0");
        if (isNaN(val) || val < 0) {
          setError(`Montant invalide pour ${mode.label}.`);
          return;
        }
      }

      // Detect discrepancies (two buckets: cash / autres)
      const ecarts: Array<{ mode: string; ecart: number }> = [];

      const compteCash = parseFloat(montantsFermeture.ESPECES || "0");
      const diffCash = compteCash - montantAttenduCash;
      if (Math.abs(diffCash) > 0.01) {
        ecarts.push({ mode: "Especes", ecart: diffCash });
      }

      const compteAutres = modesPaiement
        .filter((m) => m.code !== "ESPECES")
        .reduce((sum, m) => sum + parseFloat(montantsFermeture[m.code] || "0"), 0);
      const diffAutres = compteAutres - montantAttenduAutres;
      if (Math.abs(diffAutres) > 0.01) {
        ecarts.push({ mode: "Autres", ecart: diffAutres });
      }

      if (ecarts.length > 0) {
        setPendingEcarts(ecarts);
        setShowDiscrepancyModal(true);
        return;
      }

      void submitClose();
    },
    [session, montantsFermeture, modesPaiement, montantAttenduCash, montantAttenduAutres, submitClose],
  );

  // ── Render: No active session → Open form ──

  if (!session) {
    return (
      <div data-testid="session-open-form" className="mx-auto max-w-md">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Ouvrir une session de comptoir
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Saisissez les montants du fond de comptoir pour demarrer.
          </p>

          {error && (
            <div
              data-testid="session-error"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleOpen} className="space-y-4">
            {modesPaiement.map((mode) => (
              <div key={mode.code}>
                <label
                  htmlFor={`ouverture-${mode.code}`}
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Fond de caisse ({mode.label})
                </label>
                <input
                  id={`ouverture-${mode.code}`}
                  data-testid={`input-montant-ouverture-${mode.code.toLowerCase()}`}
                  type="number"
                  min="0"
                  step="1"
                  required={mode.code === "ESPECES"}
                  value={montantsOuverture[mode.code] ?? ""}
                  onChange={(e) =>
                    setMontantsOuverture((prev) => ({ ...prev, [mode.code]: e.target.value }))
                  }
                  placeholder="0"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>
            ))}

            {modesPaiement.length === 0 && (
              <div className="text-sm text-zinc-500 dark:text-zinc-400 animate-pulse">
                Chargement des modes de paiement...
              </div>
            )}

            <button
              type="submit"
              data-testid="btn-ouvrir-session"
              disabled={loading || modesPaiement.length === 0}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Ouverture en cours..." : "Ouvrir le comptoir"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: Active session → Details + Close ──

  const totalVentes = session._sum?.total ? parseFloat(session._sum.total) : 0;
  const nbVentes = session._count?.ventes ?? 0;

  return (
    <div data-testid="session-active" className="mx-auto max-w-lg space-y-6">
      {/* Warning: discrepancy at opening */}
      {warning && (
        <div
          data-testid="session-opening-warning"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
        >
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {warning.message}
              </p>
              <div className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400">
                {Math.abs(warning.ecartCash) > 0.01 && (
                  <p>
                    Especes — Solde caisse: {formatFCFA(warning.soldeCaisseCash)} / Declare: {formatFCFA(warning.soldeCaisseCash + warning.ecartCash)} → Ecart: {warning.ecartCash > 0 ? "+" : ""}{formatFCFA(warning.ecartCash)}
                  </p>
                )}
                {Math.abs(warning.ecartAutres) > 0.01 && (
                  <p>
                    Autres — Solde caisse: {formatFCFA(warning.soldeCaisseAutres)} / Declare: {formatFCFA(warning.soldeCaisseAutres + warning.ecartAutres)} → Ecart: {warning.ecartAutres > 0 ? "+" : ""}{formatFCFA(warning.ecartAutres)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setWarning(null)}
                className="mt-2 text-xs font-medium text-amber-600 underline hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session details */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Session en cours
          </h2>
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Ouverte
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Ouverture</dt>
            <dd
              data-testid="session-ouverture-at"
              className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              suppressHydrationWarning
            >
              {formatDateTime(session.ouvertureAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Fond de caisse (Cash)</dt>
            <dd
              data-testid="session-montant-ouverture-cash"
              className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {formatFCFA(session.montantOuvertureCash)}
            </dd>
          </div>
          {parseFloat(session.montantOuvertureMobileMoney) > 0 && (
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Fond de caisse (Autres)</dt>
              <dd
                data-testid="session-montant-ouverture-mobile-money"
                className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {formatFCFA(session.montantOuvertureMobileMoney)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total ventes</dt>
            <dd
              data-testid="session-total-ventes"
              className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {formatFCFA(totalVentes)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Transactions</dt>
            <dd
              data-testid="session-nb-ventes"
              className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {nbVentes}
            </dd>
          </div>
        </dl>
      </div>

      {error && (
        <div
          data-testid="session-error"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* Close session */}
      {!showCloseForm ? (
        <button
          type="button"
          data-testid="btn-show-close-form"
          onClick={() => setShowCloseForm(true)}
          className="w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Fermer la session
        </button>
      ) : (
        <div
          data-testid="session-close-form"
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Fermeture de session
          </h3>

          {/* Recap detaille par mode */}
          {modesPaiement.length > 0 && ((fondOuverture.cash > 0 || fondOuverture.autres > 0) || Object.keys(recapParMode).length > 0 || Object.keys(ventesParMode).length > 0) && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Recapitulatif
              </h4>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400" />
                      {modesPaiement.map((mode) => (
                        <th key={mode.code} className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {mode.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {(RECAP_ROWS).map((row) => {
                      const getValue = (modeCode: string): number => {
                        if (row.useFondOuverture) {
                          if (modeCode === "ESPECES") return fondOuverture.cash;
                          // Show fond "autres" only on the first non-ESPECES mode column
                          const firstNonCash = modesPaiement.find((m) => m.code !== "ESPECES");
                          return firstNonCash?.code === modeCode ? fondOuverture.autres : 0;
                        }
                        if (row.useVentesParMode) return ventesParMode[modeCode] ?? 0;
                        return recapParMode[modeCode]?.[row.key] ?? 0;
                      };
                      const hasData = modesPaiement.some((m) => getValue(m.code) !== 0);
                      if (!hasData) return null;
                      return (
                        <tr key={row.key}>
                          <td className="px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {row.sign === "-" ? "- " : row.sign === "+" ? "+ " : ""}{row.label}
                          </td>
                          {modesPaiement.map((mode) => {
                            const val = getValue(mode.code);
                            return (
                              <td key={mode.code} className="px-3 py-2 text-right text-xs tabular-nums text-zinc-900 dark:text-zinc-100">
                                {val !== 0 ? formatFCFA(Math.abs(val)) : "-"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr className="border-t-2 border-zinc-300 dark:border-zinc-600">
                      <td className="px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        = Montant attendu
                      </td>
                      {modesPaiement.map((mode) => {
                        let attendu = 0;
                        if (mode.code === "ESPECES") {
                          attendu = montantAttenduCash;
                        } else {
                          const firstNonCash = modesPaiement.find((m) => m.code !== "ESPECES");
                          attendu = firstNonCash?.code === mode.code ? montantAttenduAutres : 0;
                        }
                        return (
                          <td
                            key={mode.code}
                            data-testid={`montant-attendu-${mode.code.toLowerCase()}`}
                            className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100"
                          >
                            {attendu !== 0 ? formatFCFA(attendu) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <form onSubmit={handleClose} className="space-y-4">
            {/* Un champ par mode de paiement */}
            {modesPaiement.map((mode) => {
              const montantCompte = parseFloat(montantsFermeture[mode.code] || "");
              // For non-ESPECES: sum all non-cash inputs and compare to montantAttenduAutres
              let ecart: number | null = null;
              if (mode.code === "ESPECES") {
                if (!isNaN(montantCompte)) ecart = montantCompte - montantAttenduCash;
              } else {
                // Only show aggregate ecart on the first non-cash mode
                const firstNonCash = modesPaiement.find((m) => m.code !== "ESPECES");
                if (firstNonCash?.code === mode.code) {
                  const totalAutres = modesPaiement
                    .filter((m) => m.code !== "ESPECES")
                    .reduce((sum, m) => {
                      const v = parseFloat(montantsFermeture[m.code] || "");
                      return sum + (isNaN(v) ? 0 : v);
                    }, 0);
                  const anyFilled = modesPaiement
                    .filter((m) => m.code !== "ESPECES")
                    .some((m) => montantsFermeture[m.code] !== undefined && montantsFermeture[m.code] !== "");
                  if (anyFilled) ecart = totalAutres - montantAttenduAutres;
                }
              }

              return (
                <div key={`fermeture-${mode.code}`}>
                  <label
                    htmlFor={`fermeture-${mode.code}`}
                    className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Montant compte ({mode.label})
                  </label>
                  <input
                    id={`fermeture-${mode.code}`}
                    data-testid={`input-montant-fermeture-${mode.code.toLowerCase()}`}
                    type="number"
                    min="0"
                    step="1"
                    required={mode.code === "ESPECES"}
                    value={montantsFermeture[mode.code] ?? ""}
                    onChange={(e) =>
                      setMontantsFermeture((prev) => ({ ...prev, [mode.code]: e.target.value }))
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />

                  {/* Ecart en temps reel */}
                  {ecart !== null && (
                    <div
                      data-testid={`ecart-${mode.code.toLowerCase()}`}
                      className={`mt-2 rounded-lg border px-4 py-3 ${
                        ecart === 0
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                          : ecart > 0
                            ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                      }`}
                    >
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Ecart {mode.label}
                      </div>
                      <div
                        className={`mt-0.5 text-lg font-bold ${
                          ecart === 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ecart > 0
                              ? "text-blue-700 dark:text-blue-400"
                              : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {ecart > 0 ? "+" : ""}
                        {formatFCFA(ecart)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {ecart === 0
                          ? "Equilibre"
                          : ecart > 0
                            ? `Excedent ${mode.label.toLowerCase()}`
                            : `Manquant ${mode.label.toLowerCase()}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div>
              <label
                htmlFor="notesFermeture"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Notes (optionnel)
              </label>
              <textarea
                id="notesFermeture"
                data-testid="input-notes-fermeture"
                rows={2}
                value={notesFermeture}
                onChange={(e) => setNotesFermeture(e.target.value)}
                placeholder="Observations, remarques..."
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCloseForm(false);
                  setError(null);
                }}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                data-testid="btn-fermer-session"
                disabled={loading}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Fermeture en cours..." : "Confirmer la fermeture"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Discrepancy confirmation modal */}
      {showDiscrepancyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            data-testid="discrepancy-modal"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Ecart detecte
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Les montants comptes ne correspondent pas aux montants attendus.
                </p>
              </div>
            </div>

            <div className="mb-4 space-y-2">
              {pendingEcarts.map((e) => (
                <div
                  key={e.mode}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    e.ecart > 0
                      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                  }`}
                >
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{e.mode}</span>
                  <span className={`text-sm font-bold ${
                    e.ecart > 0
                      ? "text-blue-700 dark:text-blue-400"
                      : "text-red-700 dark:text-red-400"
                  }`}>
                    {e.ecart > 0 ? "+" : ""}{formatFCFA(e.ecart)}
                    <span className="ml-1 text-xs font-normal">
                      ({e.ecart > 0 ? "excedent" : "manquant"})
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">
              Verifiez que vous avez bien compte tous les fonds avant de valider. Une fois confirme, l&apos;ecart sera enregistre.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                data-testid="discrepancy-modal-cancel"
                onClick={() => setShowDiscrepancyModal(false)}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                Revenir et verifier
              </button>
              <button
                type="button"
                data-testid="discrepancy-modal-confirm"
                disabled={loading}
                onClick={() => void submitClose()}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Fermeture..." : "Confirmer l'ecart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
