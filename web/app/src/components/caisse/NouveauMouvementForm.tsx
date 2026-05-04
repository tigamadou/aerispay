"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ModePaiementOption {
  code: string;
  label: string;
}

interface CaisseInfo {
  id: string;
  nom: string;
}

const TYPE_LABELS: Record<string, string> = {
  APPORT: "Apport",
  RETRAIT: "Retrait",
  DEPENSE: "Depense",
};

export function NouveauMouvementForm() {
  const router = useRouter();
  const initialized = useRef(false);

  const [caisses, setCaisses] = useState<CaisseInfo[]>([]);
  const [selectedCaisseId, setSelectedCaisseId] = useState("");
  const [modesPaiement, setModesPaiement] = useState<ModePaiementOption[]>([]);

  const [formType, setFormType] = useState<"APPORT" | "RETRAIT" | "DEPENSE">("APPORT");
  const [formMode, setFormMode] = useState("");
  const [formMontant, setFormMontant] = useState("");
  const [formMotif, setFormMotif] = useState("");
  const [formReference, setFormReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    Promise.all([
      fetch("/api/caisse").then((r) => r.json()),
      fetch("/api/parametres/modes-paiement").then((r) => r.json()),
    ]).then(([caisseBody, modesBody]) => {
      const list = caisseBody.data ?? [];
      setCaisses(list);
      if (list.length > 0) setSelectedCaisseId(list[0].id);

      const modes = modesBody.data ?? [];
      setModesPaiement(modes);
      if (modes.length > 0) setFormMode(modes[0].code);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaisseId || !formMode) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

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

      setSuccess(`${TYPE_LABELS[formType]} de ${parseFloat(formMontant).toLocaleString("fr-FR")} F enregistre`);
      setFormMontant("");
      setFormMotif("");
      setFormReference("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  };

  if (caisses.length === 0 && modesPaiement.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-full bg-zinc-200 rounded dark:bg-zinc-700" />
        <div className="h-10 w-full bg-zinc-200 rounded dark:bg-zinc-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          <div className="flex items-center justify-between">
            <span>{success}</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setSuccess(null); }}
                className="text-sm font-medium text-green-700 underline hover:text-green-900 dark:text-green-300"
              >
                Nouveau mouvement
              </button>
              <button
                onClick={() => router.push("/caisse/mouvements")}
                className="text-sm font-medium text-green-700 underline hover:text-green-900 dark:text-green-300"
              >
                Voir les mouvements
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Caisse selector */}
        {caisses.length > 1 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Caisse
            </label>
            <select
              value={selectedCaisseId}
              onChange={(e) => setSelectedCaisseId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {caisses.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Type de mouvement *
            </label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value as "APPORT" | "RETRAIT" | "DEPENSE")}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="APPORT">Apport</option>
              <option value="RETRAIT">Retrait</option>
              <option value="DEPENSE">Depense</option>
            </select>
          </div>

          {/* Mode */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Mode de paiement *
            </label>
            <select
              value={formMode}
              onChange={(e) => setFormMode(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {modesPaiement.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Montant */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Montant (FCFA) *
          </label>
          <input
            type="number"
            min="1"
            step="1"
            required
            value={formMontant}
            onChange={(e) => setFormMontant(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Motif */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Motif *
          </label>
          <input
            type="text"
            required
            maxLength={500}
            value={formMotif}
            onChange={(e) => setFormMotif(e.target.value)}
            placeholder="Raison du mouvement"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Reference */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reference (optionnel)
          </label>
          <input
            type="text"
            maxLength={100}
            value={formReference}
            onChange={(e) => setFormReference(e.target.value)}
            placeholder="Ex: RECU-001"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !formMontant || !formMotif}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/caisse/mouvements")}
            className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
