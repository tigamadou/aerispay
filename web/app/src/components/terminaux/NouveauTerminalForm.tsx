"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1, "Code requis").max(20),
  nom: z.string().min(1, "Nom requis").max(100),
});

type FieldErrors = Partial<Record<"code" | "nom", string>>;

export function NouveauTerminalForm({ defaultCode = "" }: { defaultCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(defaultCode);
  const [nom, setNom] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const parsed = schema.safeParse({ code, nom });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ code: flat.code?.[0], nom: flat.nom?.[0] });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/terminaux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body.error ?? "Erreur lors de la création");
        return;
      }
      router.push("/terminaux");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="code" className="block text-sm font-medium">
          Code terminal
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {errors.code && <p className="mt-1 text-sm text-red-600">{errors.code}</p>}
        <p className="mt-1 text-xs text-zinc-500">
          Suggéré automatiquement — modifiable (ex. P3, ou un code parlant comme BAR).
        </p>
      </div>
      <div>
        <label htmlFor="nom" className="block text-sm font-medium">
          Nom
        </label>
        <input
          id="nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {errors.nom && <p className="mt-1 text-sm text-red-600">{errors.nom}</p>}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? "Création…" : "Créer le terminal"}
      </button>
    </form>
  );
}
