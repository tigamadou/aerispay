"use client";

import { useState } from "react";

interface Props {
  caisseId: string;
}

export function EnrollmentCodeButton({ caisseId }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCode(null);
    try {
      const res = await fetch("/api/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caisseId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Erreur");
        return;
      }
      setCode(body.data.enrollmentToken);
      setExpiresAt(body.data.expiresAt);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Enrôler un poste</h3>
      <p className="text-xs text-zinc-500">Génère un code à usage unique à saisir sur le poste de caisse.</p>
      <button
        onClick={generate}
        disabled={loading}
        className="mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Génération…" : "Générer un code d'enrôlement"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {code && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-zinc-500">Code (copiez-le, affiché une seule fois) :</p>
          <code className="block break-all rounded bg-zinc-100 p-2 font-mono text-sm dark:bg-zinc-800">{code}</code>
          {expiresAt && (
            <p className="text-xs text-zinc-500">Expire le {new Date(expiresAt).toLocaleString("fr-FR")}</p>
          )}
        </div>
      )}
    </div>
  );
}
