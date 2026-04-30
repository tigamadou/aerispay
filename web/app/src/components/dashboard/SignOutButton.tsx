"use client";

import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";

interface SignOutButtonProps {
  openSessionId?: string | null;
}

function formatFCFA(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/\u202F/g, " ")} FCFA`;
}

export function SignOutButton({ openSessionId }: SignOutButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [montant, setMontant] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [soldeTheorique, setSoldeTheorique] = useState<number | null>(null);

  // Fetch solde théorique when modal opens
  useEffect(() => {
    if (!showModal || !openSessionId) return;
    let cancelled = false;
    fetch(`/api/caisse/sessions/${openSessionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.data?.soldeTheorique != null) {
          setSoldeTheorique(json.data.soldeTheorique);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showModal, openSessionId]);

  const montantCompte = parseFloat(montant);
  const ecart =
    !isNaN(montantCompte) && soldeTheorique !== null
      ? montantCompte - soldeTheorique
      : null;

  async function handleSignOut() {
    if (openSessionId) {
      setShowModal(true);
      return;
    }
    void signOut({ callbackUrl: "/login" });
  }

  async function handleCloseAndSignOut() {
    if (isNaN(montantCompte) || montantCompte < 0) {
      setError("Veuillez saisir un montant valide");
      return;
    }

    setPending(true);
    setError("");

    try {
      const res = await fetch(`/api/caisse/sessions/${openSessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montantFermeture: montantCompte, notes: notes || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erreur lors de la clôture");
        setPending(false);
        return;
      }

      void signOut({ callbackUrl: "/login" });
    } catch {
      setError("Erreur de connexion au serveur");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Déconnexion
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900 space-y-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Clôturer la session de caisse
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Vous devez fermer votre session de caisse avant de vous déconnecter.
            </p>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Solde théorique */}
            {soldeTheorique !== null && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Solde théorique</div>
                <div className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatFCFA(soldeTheorique)}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="montant-fermeture" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Montant compté (FCFA)
              </label>
              <input
                id="montant-fermeture"
                type="number"
                min="0"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                data-testid="signout-montant"
              />
            </div>

            {/* Écart de caisse en temps réel */}
            {ecart !== null && (
              <div
                data-testid="signout-ecart"
                className={`rounded-lg border px-4 py-3 ${
                  ecart === 0
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                    : ecart > 0
                      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                }`}
              >
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Écart de caisse</div>
                <div
                  className={`mt-0.5 text-lg font-bold ${
                    ecart === 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : ecart > 0
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {ecart > 0 ? "+" : ""}{formatFCFA(ecart)}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {ecart === 0 ? "Caisse équilibrée" : ecart > 0 ? "Excédent" : "Manquant"}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="notes-fermeture" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Notes (optionnel)
              </label>
              <textarea
                id="notes-fermeture"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleCloseAndSignOut}
                disabled={pending}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                data-testid="signout-confirm"
              >
                {pending ? "Clôture…" : "Clôturer et se déconnecter"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={pending}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
