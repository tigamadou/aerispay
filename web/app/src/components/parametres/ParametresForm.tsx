"use client";

import { useState } from "react";

interface ParametresData {
  nomCommerce: string;
  adresse: string;
  telephone: string;
  email: string;
  rccm: string;
  nif: string;
}

interface ParametresFormProps {
  initialData: ParametresData;
}

export function ParametresForm({ initialData }: ParametresFormProps) {
  const [form, setForm] = useState<ParametresData>(initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const handleChange = (field: keyof ParametresData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: [] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrors({});

    try {
      const res = await fetch("/api/parametres", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const body = await res.json();

      if (!res.ok) {
        if (body.details?.fieldErrors) {
          setErrors(body.details.fieldErrors);
        }
        setMessage({ type: "error", text: body.error ?? "Erreur lors de la sauvegarde" });
        return;
      }

      setMessage({ type: "success", text: "Parametres enregistres avec succes" });
    } catch {
      setMessage({ type: "error", text: "Erreur de connexion au serveur" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* Nom du commerce */}
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Informations generales
        </legend>

        <Field
          label="Nom de la structure / commerce *"
          value={form.nomCommerce}
          onChange={(v) => handleChange("nomCommerce", v)}
          placeholder="Ex: Super Marche Dakar"
          errors={errors.nomCommerce}
        />

        <Field
          label="Adresse"
          value={form.adresse}
          onChange={(v) => handleChange("adresse", v)}
          placeholder="Ex: 123 Rue du Commerce, Dakar"
          errors={errors.adresse}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Telephone"
            value={form.telephone}
            onChange={(v) => handleChange("telephone", v)}
            placeholder="Ex: +221 77 000 00 00"
            errors={errors.telephone}
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => handleChange("email", v)}
            placeholder="Ex: contact@boutique.com"
            type="email"
            errors={errors.email}
          />
        </div>
      </fieldset>

      {/* Informations legales */}
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Informations legales
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="RCCM (Registre du Commerce)"
            value={form.rccm}
            onChange={(v) => handleChange("rccm", v)}
            placeholder="Ex: SN-DKR-2024-B-12345"
            errors={errors.rccm}
          />
          <Field
            label="NIF / IFU (Identifiant Fiscal)"
            value={form.nif}
            onChange={(v) => handleChange("nif", v)}
            placeholder="Ex: 1234567890"
            errors={errors.nif}
          />
        </div>
      </fieldset>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ─── Field sub-component ────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  errors?: string[];
}

function Field({ label, value, onChange, placeholder, type = "text", errors }: FieldProps) {
  const hasError = errors && errors.length > 0;
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 ${
          hasError
            ? "border-red-300 focus:border-red-500 focus:ring-red-500"
            : "border-zinc-200 focus:border-indigo-500 focus:ring-indigo-500 dark:border-zinc-600"
        }`}
      />
      {hasError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[0]}</p>
      )}
    </div>
  );
}
