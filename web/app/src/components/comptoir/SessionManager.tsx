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
  const [showCloseForm, setShowCloseForm] = useState(false);

  // Dynamic payment modes
  const [modesPaiement, setModesPaiement] = useState<ModePaiementOption[]>([]);
  const modesInitialized = useRef(false);

  // Ouverture: montant par mode { code: "valeur" }
  const [montantsOuverture, setMontantsOuverture] = useState<Record<string, string>>({});

  // Fermeture: montant par mode
  const [montantsFermeture, setMontantsFermeture] = useState<Record<string, string>>({});
  const [notesFermeture, setNotesFermeture] = useState("");

  // Solde theorique par mode (live)
  const [soldesTheoriques, setSoldesTheoriques] = useState<Record<string, number>>({});

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

  // Fetch live solde theorique when opening close form
  useEffect(() => {
    if (!showCloseForm || !session) return;
    let cancelled = false;
    fetch(`/api/comptoir/sessions/${session.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const soldes: Record<string, number> = {};
        if (json.data?.soldeTheoriqueCash != null) {
          soldes.ESPECES = Number(json.data.soldeTheoriqueCash);
        }
        if (json.data?.soldeTheoriqueMobileMoney != null) {
          // Distribute across non-ESPECES modes
          const nonCashModes = modesPaiement.filter((m) => m.code !== "ESPECES");
          if (nonCashModes.length > 0) {
            // For now, show total on first non-cash mode
            soldes[nonCashModes[0].code] = Number(json.data.soldeTheoriqueMobileMoney);
          }
        }
        // Also try ecartsParMode if available
        if (json.data?.ecartsParMode) {
          try {
            const epm = typeof json.data.ecartsParMode === "string"
              ? JSON.parse(json.data.ecartsParMode)
              : json.data.ecartsParMode;
            for (const [mode, data] of Object.entries(epm)) {
              if (data && typeof data === "object" && "theorique" in data) {
                soldes[mode] = Number((data as { theorique: number }).theorique);
              }
            }
          } catch { /* ignore */ }
        }
        setSoldesTheoriques(soldes);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showCloseForm, session, modesPaiement]);

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
      } catch {
        setError("Erreur reseau. Veuillez reessayer.");
      } finally {
        setLoading(false);
      }
    },
    [montantsOuverture, modesPaiement],
  );

  // ── Close session ──

  const handleClose = useCallback(
    async (e: React.FormEvent) => {
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

          {/* Soldes theoriques par mode */}
          {Object.keys(soldesTheoriques).length > 0 && (
            <div className="mb-4 space-y-3">
              {modesPaiement.map((mode) => {
                const solde = soldesTheoriques[mode.code];
                if (solde == null) return null;
                return (
                  <div key={`solde-${mode.code}`} className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Solde theorique ({mode.label})
                    </div>
                    <div className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100" data-testid={`solde-theorique-${mode.code.toLowerCase()}`}>
                      {formatFCFA(solde)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleClose} className="space-y-4">
            {/* Un champ par mode de paiement */}
            {modesPaiement.map((mode) => {
              const montantCompte = parseFloat(montantsFermeture[mode.code] || "");
              const soldeTheorique = soldesTheoriques[mode.code];
              const ecart = !isNaN(montantCompte) && soldeTheorique != null
                ? montantCompte - soldeTheorique
                : null;

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
    </div>
  );
}
