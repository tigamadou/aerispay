"use client";

import { useState, useCallback, useEffect } from "react";

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

interface SessionManagerProps {
  initialSession: SerializedComptoirSession | null;
}

// ── Helpers ────────────────────────────────────────────

function formatFCFA(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  // Replace narrow no-break space (U+202F) with regular space for consistent rendering
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
  const [montantOuvertureCash, setMontantOuvertureCash] = useState("");
  const [montantOuvertureMobileMoney, setMontantOuvertureMobileMoney] = useState("");
  const [montantFermetureCash, setMontantFermetureCash] = useState("");
  const [montantFermetureMobileMoney, setMontantFermetureMobileMoney] = useState("");
  const [notesFermeture, setNotesFermeture] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [soldeTheoriqueCash, setSoldeTheoriqueCash] = useState<number | null>(
    session?.soldeTheoriqueCash ?? null
  );
  const [soldeTheoriqueMobileMoney, setSoldeTheoriqueMobileMoney] = useState<number | null>(
    session?.soldeTheoriqueMobileMoney ?? null
  );

  // Fetch live solde théorique when opening close form
  useEffect(() => {
    if (!showCloseForm || !session) return;
    let cancelled = false;
    fetch(`/api/comptoir/sessions/${session.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          if (json.data?.soldeTheoriqueCash != null) {
            setSoldeTheoriqueCash(json.data.soldeTheoriqueCash);
          }
          if (json.data?.soldeTheoriqueMobileMoney != null) {
            setSoldeTheoriqueMobileMoney(json.data.soldeTheoriqueMobileMoney);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showCloseForm, session]);

  const montantCompteCash = parseFloat(montantFermetureCash);
  const ecartCash =
    !isNaN(montantCompteCash) && soldeTheoriqueCash !== null
      ? montantCompteCash - soldeTheoriqueCash
      : null;

  const montantCompteMobileMoney = parseFloat(montantFermetureMobileMoney);
  const ecartMobileMoney =
    !isNaN(montantCompteMobileMoney) && soldeTheoriqueMobileMoney !== null
      ? montantCompteMobileMoney - soldeTheoriqueMobileMoney
      : null;

  // ── Open session ──

  const handleOpen = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const cash = parseFloat(montantOuvertureCash);
      const mobileMoney = parseFloat(montantOuvertureMobileMoney || "0");
      if (isNaN(cash) || cash < 0) {
        setError("Veuillez saisir un montant valide pour les espèces.");
        return;
      }
      if (isNaN(mobileMoney) || mobileMoney < 0) {
        setError("Veuillez saisir un montant valide pour le mobile money.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/comptoir/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ montantOuvertureCash: cash, montantOuvertureMobileMoney: mobileMoney }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Erreur lors de l'ouverture de la session.");
          return;
        }

        setSession(json.data);
        setMontantOuvertureCash("");
        setMontantOuvertureMobileMoney("");
      } catch {
        setError("Erreur réseau. Veuillez réessayer.");
      } finally {
        setLoading(false);
      }
    },
    [montantOuvertureCash, montantOuvertureMobileMoney],
  );

  // ── Close session ──

  const handleClose = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!session) return;
      setError(null);

      const cash = parseFloat(montantFermetureCash);
      const mobileMoney = parseFloat(montantFermetureMobileMoney || "0");
      if (isNaN(cash) || cash < 0) {
        setError("Veuillez saisir le montant compté (espèces).");
        return;
      }
      if (isNaN(mobileMoney) || mobileMoney < 0) {
        setError("Veuillez saisir le montant compté (mobile money).");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/comptoir/sessions/${session.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            montantFermetureCash: cash,
            montantFermetureMobileMoney: mobileMoney,
            ...(notesFermeture.trim() ? { notes: notesFermeture.trim() } : {}),
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Erreur lors de la fermeture de la session.");
          return;
        }

        setSession(null);
        setMontantFermetureCash("");
        setMontantFermetureMobileMoney("");
        setNotesFermeture("");
        setShowCloseForm(false);
      } catch {
        setError("Erreur réseau. Veuillez réessayer.");
      } finally {
        setLoading(false);
      }
    },
    [session, montantFermetureCash, montantFermetureMobileMoney, notesFermeture],
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
            Saisissez les montants du fond de comptoir pour démarrer.
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
            <div>
              <label
                htmlFor="montantOuvertureCash"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Fond de caisse (Espèces)
              </label>
              <input
                id="montantOuvertureCash"
                data-testid="input-montant-ouverture-cash"
                type="number"
                min="0"
                step="1"
                required
                value={montantOuvertureCash}
                onChange={(e) => setMontantOuvertureCash(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <div>
              <label
                htmlFor="montantOuvertureMobileMoney"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Fond de caisse (Mobile Money)
              </label>
              <input
                id="montantOuvertureMobileMoney"
                data-testid="input-montant-ouverture-mobile-money"
                type="number"
                min="0"
                step="1"
                value={montantOuvertureMobileMoney}
                onChange={(e) => setMontantOuvertureMobileMoney(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <button
              type="submit"
              data-testid="btn-ouvrir-session"
              disabled={loading}
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
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Fond de caisse (Espèces)</dt>
            <dd
              data-testid="session-montant-ouverture-cash"
              className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {formatFCFA(session.montantOuvertureCash)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Fond de caisse (Mobile Money)</dt>
            <dd
              data-testid="session-montant-ouverture-mobile-money"
              className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {formatFCFA(session.montantOuvertureMobileMoney)}
            </dd>
          </div>
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

          {/* Solde théorique */}
          {(soldeTheoriqueCash !== null || soldeTheoriqueMobileMoney !== null) && (
            <div className="space-y-3">
              {soldeTheoriqueCash !== null && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Solde théorique en comptoir (Espèces)
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100" data-testid="solde-theorique-cash">
                    {formatFCFA(soldeTheoriqueCash)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Fond de caisse + espèces encaissées − monnaie rendue
                  </div>
                </div>
              )}
              {soldeTheoriqueMobileMoney !== null && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Solde théorique en comptoir (Mobile Money)
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100" data-testid="solde-theorique-mobile-money">
                    {formatFCFA(soldeTheoriqueMobileMoney)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Fond mobile money + paiements mobile money reçus
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleClose} className="space-y-4">
            <div>
              <label
                htmlFor="montantFermetureCash"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Montant compté (Espèces)
              </label>
              <input
                id="montantFermetureCash"
                data-testid="input-montant-fermeture-cash"
                type="number"
                min="0"
                step="1"
                required
                value={montantFermetureCash}
                onChange={(e) => setMontantFermetureCash(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <div>
              <label
                htmlFor="montantFermetureMobileMoney"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Montant compté (Mobile Money)
              </label>
              <input
                id="montantFermetureMobileMoney"
                data-testid="input-montant-fermeture-mobile-money"
                type="number"
                min="0"
                step="1"
                value={montantFermetureMobileMoney}
                onChange={(e) => setMontantFermetureMobileMoney(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            {/* Écart espèces — affiché en temps réel */}
            {ecartCash !== null && (
              <div
                data-testid="ecart-cash"
                className={`rounded-lg border px-4 py-3 ${
                  ecartCash === 0
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                    : ecartCash > 0
                      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                }`}
              >
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Écart espèces
                </div>
                <div
                  className={`mt-0.5 text-lg font-bold ${
                    ecartCash === 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : ecartCash > 0
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {ecartCash > 0 ? "+" : ""}
                  {formatFCFA(ecartCash)}
                </div>
                <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  {ecartCash === 0
                    ? "Comptoir équilibré"
                    : ecartCash > 0
                      ? "Excédent espèces"
                      : "Manquant espèces"}
                </div>
              </div>
            )}

            {/* Écart mobile money — affiché en temps réel */}
            {ecartMobileMoney !== null && (
              <div
                data-testid="ecart-mobile-money"
                className={`rounded-lg border px-4 py-3 ${
                  ecartMobileMoney === 0
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                    : ecartMobileMoney > 0
                      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                }`}
              >
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Écart mobile money
                </div>
                <div
                  className={`mt-0.5 text-lg font-bold ${
                    ecartMobileMoney === 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : ecartMobileMoney > 0
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {ecartMobileMoney > 0 ? "+" : ""}
                  {formatFCFA(ecartMobileMoney)}
                </div>
                <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  {ecartMobileMoney === 0
                    ? "Comptoir équilibré"
                    : ecartMobileMoney > 0
                      ? "Excédent mobile money"
                      : "Manquant mobile money"}
                </div>
              </div>
            )}

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
