"use client";

import { useState, useRef } from "react";

interface ParametresData {
  nomCommerce: string;
  adresse: string;
  telephone: string;
  email: string;
  rccm: string;
  nif: string;
  logo: string | null;
}

interface ParametresFormProps {
  initialData: ParametresData;
}

const MAX_LOGO_SIZE = 512 * 1024; // 512 KB

export function ParametresForm({ initialData }: ParametresFormProps) {
  const [form, setForm] = useState<ParametresData>(initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (field: keyof ParametresData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: [] }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, logo: ["Le fichier doit etre une image"] }));
      return;
    }

    if (file.size > MAX_LOGO_SIZE) {
      setErrors((prev) => ({ ...prev, logo: ["L'image ne doit pas depasser 512 Ko"] }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, logo: reader.result as string }));
      setErrors((prev) => ({ ...prev, logo: [] }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setForm((prev) => ({ ...prev, logo: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      {/* Logo */}
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Logo
        </legend>

        <div className="flex items-start gap-4">
          {form.logo ? (
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logo}
                alt="Logo de la structure"
                className="h-24 w-24 rounded-lg border border-zinc-200 object-contain bg-white dark:border-zinc-600"
              />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white text-xs hover:bg-red-700"
                aria-label="Supprimer le logo"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600">
              <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Logo de la structure
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoChange}
              className="block text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-indigo-900/30 dark:file:text-indigo-400"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              PNG, JPEG, SVG ou WebP. 512 Ko max. Affiche sur les tickets.
            </p>
            {errors.logo && errors.logo.length > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.logo[0]}</p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Informations generales */}
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
