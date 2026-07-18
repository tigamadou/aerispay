"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TerminalEditForm({ id, nom, active }: { id: string; nom: string; active: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(nom);
  const [error, setError] = useState<string | null>(null);

  async function update(data: { nom?: string; active?: boolean }) {
    setError(null);
    const res = await fetch(`/api/terminaux/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor="nom" className="block text-sm font-medium">
            Nom
          </label>
          <input
            id="nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 rounded border px-3 py-2"
          />
        </div>
        <button
          onClick={() => update({ nom: name })}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
        >
          Renommer
        </button>
        <button onClick={() => update({ active: !active })} className="rounded-md border px-3 py-2 text-sm">
          {active ? "Désactiver" : "Réactiver"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
