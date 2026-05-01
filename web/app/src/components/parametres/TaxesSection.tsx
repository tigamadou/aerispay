"use client";

import { useState } from "react";

interface TaxeData {
  id: string;
  nom: string;
  taux: number;
  active: boolean;
  ordre: number;
}

interface TaxesSectionProps {
  initialTaxes: TaxeData[];
}

export function TaxesSection({ initialTaxes }: TaxesSectionProps) {
  const [taxes, setTaxes] = useState<TaxeData[]>(initialTaxes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formNom, setFormNom] = useState("");
  const [formTaux, setFormTaux] = useState("");
  const [formActive, setFormActive] = useState(true);

  const resetForm = () => {
    setFormNom("");
    setFormTaux("");
    setFormActive(true);
    setShowAddForm(false);
    setEditingId(null);
  };

  const startEdit = (taxe: TaxeData) => {
    setEditingId(taxe.id);
    setFormNom(taxe.nom);
    setFormTaux(String(taxe.taux));
    setFormActive(taxe.active);
    setShowAddForm(false);
  };

  const startAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleSave = async () => {
    const taux = parseFloat(formTaux);
    if (!formNom.trim()) {
      setMessage({ type: "error", text: "Le nom de la taxe est obligatoire" });
      return;
    }
    if (isNaN(taux) || taux < 0 || taux > 100) {
      setMessage({ type: "error", text: "Le taux doit etre entre 0 et 100" });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (editingId) {
        const res = await fetch(`/api/taxes/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom: formNom.trim(), taux, active: formActive }),
        });
        const body = await res.json();
        if (!res.ok) {
          setMessage({ type: "error", text: body.error ?? "Erreur lors de la mise a jour" });
          return;
        }
        setTaxes((prev) =>
          prev.map((t) => (t.id === editingId ? { ...t, nom: formNom.trim(), taux, active: formActive } : t))
        );
        setMessage({ type: "success", text: "Taxe mise a jour" });
      } else {
        const ordre = taxes.length;
        const res = await fetch("/api/taxes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom: formNom.trim(), taux, active: formActive, ordre }),
        });
        const body = await res.json();
        if (!res.ok) {
          setMessage({ type: "error", text: body.error ?? "Erreur lors de la creation" });
          return;
        }
        setTaxes((prev) => [...prev, { id: body.data.id, nom: formNom.trim(), taux, active: formActive, ordre }]);
        setMessage({ type: "success", text: "Taxe ajoutee" });
      }
      resetForm();
    } catch {
      setMessage({ type: "error", text: "Erreur de connexion au serveur" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/taxes/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Erreur lors de la suppression" });
        return;
      }
      setTaxes((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) resetForm();
      setMessage({ type: "success", text: "Taxe supprimee" });
    } catch {
      setMessage({ type: "error", text: "Erreur de connexion au serveur" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (taxe: TaxeData) => {
    try {
      const res = await fetch(`/api/taxes/${taxe.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !taxe.active }),
      });
      if (!res.ok) return;
      setTaxes((prev) =>
        prev.map((t) => (t.id === taxe.id ? { ...t, active: !t.active } : t))
      );
    } catch {
      /* silent */
    }
  };

  const isEditing = editingId !== null || showAddForm;

  return (
    <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Taxes
      </legend>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Existing taxes list */}
      {taxes.length > 0 && (
        <div className="space-y-2">
          {taxes.map((taxe) => (
            <div
              key={taxe.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                taxe.active
                  ? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
                  : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleActive(taxe)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    taxe.active ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                  aria-label={taxe.active ? "Desactiver" : "Activer"}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      taxe.active ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                <div>
                  <span className={`text-sm font-medium ${taxe.active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {taxe.nom}
                  </span>
                  <span className={`ml-2 text-sm ${taxe.active ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {taxe.taux}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(taxe)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                  aria-label="Modifier"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(taxe.id)}
                  className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  aria-label="Supprimer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {taxes.length === 0 && !showAddForm && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Aucune taxe configuree. Ajoutez une taxe pour l&apos;appliquer aux ventes.
        </p>
      )}

      {/* Add/Edit form */}
      {isEditing && (
        <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-900/10">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {editingId ? "Modifier la taxe" : "Nouvelle taxe"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Nom *
              </label>
              <input
                type="text"
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
                placeholder="Ex: TVA, AIB, TPS..."
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Taux (%) *
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formTaux}
                onChange={(e) => setFormTaux(e.target.value)}
                placeholder="Ex: 18"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="taxe-active"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="taxe-active" className="text-sm text-zinc-700 dark:text-zinc-300">
              Active
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Enregistrement..." : editingId ? "Mettre a jour" : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!isEditing && (
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ajouter une taxe
        </button>
      )}
    </fieldset>
  );
}
