"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface SessionDetailActionsProps {
  sessionId: string;
  statut: string;
  userId: string;
  currentUserId: string;
  canValidate: boolean;
  canForceClose: boolean;
  canVerify: boolean;
  canCorrect: boolean;
  canViewZReport: boolean;
}

export function SessionDetailActions({
  sessionId,
  statut,
  userId,
  currentUserId,
  canValidate,
  canForceClose,
  canVerify,
  canCorrect: _canCorrect,
  canViewZReport,
}: SessionDetailActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showBlindValidateModal, setShowBlindValidateModal] = useState(false);
  const [modesPaiement, setModesPaiement] = useState<Array<{ code: string; label: string }>>([]);
  const [montantsValidation, setMontantsValidation] = useState<Record<string, string>>({});
  const modesInitialized = useRef(false);

  const isOwner = userId === currentUserId;
  const isTerminal = ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"].includes(statut);
  const canBlindValidate = canValidate && statut === "EN_ATTENTE_VALIDATION" && !isOwner;

  function openBlindValidateModal() {
    setShowBlindValidateModal(true);
    setMontantsValidation({});
    setMessage(null);
    if (!modesInitialized.current) {
      modesInitialized.current = true;
      fetch("/api/parametres/modes-paiement")
        .then((r) => r.json())
        .then((body) => {
          setModesPaiement(body.data ?? []);
        })
        .catch(() => {});
    }
  }

  async function handleBlindValidate() {
    const declarations: Record<string, number> = {};
    for (const mode of modesPaiement) {
      const val = parseFloat(montantsValidation[mode.code] || "0");
      if (val > 0 || mode.code === "ESPECES") {
        declarations[mode.code] = val;
      }
    }

    setLoading("blindvalidate");
    setMessage(null);
    try {
      const res = await fetch(`/api/comptoir/sessions/${sessionId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declarations }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Erreur" });
        return;
      }
      const outcome = body.data?.reconciliation?.outcome;
      if (outcome === "VALIDATED") {
        setMessage({ type: "success", text: "Session validee avec succes" });
        setShowBlindValidateModal(false);
        router.refresh();
      } else {
        setMessage({ type: "error", text: body.data?.reconciliation?.reason ?? "Resultat inattendu" });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur reseau" });
    } finally {
      setLoading(null);
    }
  }

  async function handleVerify() {
    setLoading("verify");
    setMessage(null);
    try {
      const res = await fetch(`/api/comptoir/sessions/${sessionId}/verify`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Erreur" });
        return;
      }
      setMessage({
        type: body.data.valid ? "success" : "error",
        text: body.data.valid ? "Integrite verifiee : VALIDE" : "ATTENTION : Integrite INVALIDE — le hash ne correspond pas",
      });
    } catch {
      setMessage({ type: "error", text: "Erreur reseau" });
    } finally {
      setLoading(null);
    }
  }

  async function handleZReport() {
    setLoading("zreport");
    try {
      const res = await fetch(`/api/comptoir/sessions/${sessionId}/z-report`);
      if (!res.ok) {
        const body = await res.json();
        setMessage({ type: "error", text: body.error ?? "Erreur" });
        return;
      }
      const body = await res.json();
      // Open in new tab as JSON for now (PDF generation in future phase)
      const blob = new Blob([JSON.stringify(body.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      setMessage({ type: "error", text: "Erreur reseau" });
    } finally {
      setLoading(null);
    }
  }

  async function handleForceClose() {
    const motif = prompt("Motif de la fermeture forcee (min 3 caracteres) :");
    if (!motif || motif.length < 3) {
      setMessage({ type: "error", text: "Motif requis (min 3 caracteres)" });
      return;
    }
    const password = prompt("Mot de passe administrateur :");
    if (!password) return;

    setLoading("forceclose");
    setMessage(null);
    try {
      const res = await fetch(`/api/comptoir/sessions/${sessionId}/force-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif, motDePasse: password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Erreur" });
        return;
      }
      setMessage({ type: "success", text: "Session fermee de force" });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Erreur reseau" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Verify integrity — terminal sessions only */}
        {canVerify && isTerminal && (
          <button
            onClick={handleVerify}
            disabled={loading === "verify"}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
          >
            {loading === "verify" ? "Verification..." : "Verifier integrite"}
          </button>
        )}

        {/* Z de caisse — terminal sessions only */}
        {canViewZReport && isTerminal && (
          <button
            onClick={handleZReport}
            disabled={loading === "zreport"}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
          >
            {loading === "zreport" ? "Generation..." : "Z de caisse"}
          </button>
        )}

        {/* Blind validate — EN_ATTENTE_VALIDATION only */}
        {canBlindValidate && (
          <button
            data-testid="btn-blind-validate"
            onClick={openBlindValidateModal}
            className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition"
          >
            Valider (comptage aveugle)
          </button>
        )}

        {/* Force close — non-terminal sessions */}
        {canForceClose && !isTerminal && (
          <button
            onClick={handleForceClose}
            disabled={loading === "forceclose"}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition"
          >
            {loading === "forceclose" ? "Fermeture..." : "Forcer la cloture"}
          </button>
        )}
      </div>

      {/* Blind validation modal */}
      {showBlindValidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            data-testid="blind-validate-modal"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
          >
            <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Validation a l&apos;aveugle
            </h3>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Saisissez les montants comptes sans consulter les declarations du caissier.
            </p>

            {modesPaiement.length === 0 ? (
              <p className="text-sm text-zinc-400 animate-pulse">Chargement des modes de paiement...</p>
            ) : (
              <div className="space-y-3">
                {modesPaiement.map((mode) => (
                  <div key={mode.code}>
                    <label
                      htmlFor={`validate-${mode.code}`}
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      {mode.label}
                    </label>
                    <input
                      id={`validate-${mode.code}`}
                      data-testid={`input-validate-${mode.code.toLowerCase()}`}
                      type="number"
                      min="0"
                      step="1"
                      value={montantsValidation[mode.code] ?? ""}
                      onChange={(e) =>
                        setMontantsValidation((prev) => ({ ...prev, [mode.code]: e.target.value }))
                      }
                      placeholder="0"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                data-testid="btn-cancel-blind-validate"
                onClick={() => setShowBlindValidateModal(false)}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                Annuler
              </button>
              <button
                type="button"
                data-testid="btn-submit-blind-validate"
                disabled={loading === "blindvalidate" || modesPaiement.length === 0}
                onClick={() => void handleBlindValidate()}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading === "blindvalidate" ? "Validation..." : "Soumettre mon comptage"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`rounded-lg p-3 text-sm ${
          message.type === "success"
            ? "bg-green-50 text-green-800 border border-green-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
