"use client";

import { useState } from "react";
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
  canCorrect,
  canViewZReport,
}: SessionDetailActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isOwner = userId === currentUserId;
  const isTerminal = ["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"].includes(statut);

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
    const motif = prompt("Motif de la fermeture forcee (min 10 caracteres) :");
    if (!motif || motif.length < 10) {
      setMessage({ type: "error", text: "Motif requis (min 10 caracteres)" });
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
