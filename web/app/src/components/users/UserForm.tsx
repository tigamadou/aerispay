"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    nom: string;
    email: string;
    role: string;
    actif: boolean;
  };
}

export function UserForm({ mode, initialData }: UserFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const [nom, setNom] = useState(initialData?.nom ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState(initialData?.role ?? "CAISSIER");
  const [actif, setActif] = useState(initialData?.actif ?? true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);

    try {
      const url = mode === "create" ? "/api/users" : `/api/users/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const body: Record<string, unknown> = { nom, email, role };
      if (mode === "create") {
        body.motDePasse = motDePasse;
      } else {
        if (motDePasse) body.motDePasse = motDePasse;
        body.actif = actif;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Une erreur est survenue");
        return;
      }

      router.push("/users");
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4" data-testid="user-form">
      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          data-testid="user-form-error"
        >
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="nom" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Nom
        </label>
        <input
          id="nom"
          type="text"
          required
          minLength={2}
          maxLength={100}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="user-nom"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="user-email"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="motDePasse" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {mode === "create" ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour ne pas changer)"}
        </label>
        <input
          id="motDePasse"
          type="password"
          required={mode === "create"}
          minLength={8}
          maxLength={72}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="user-password"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="role" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Rôle
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="user-role"
        >
          <option value="CAISSIER">Caissier</option>
          <option value="MANAGER">Gérant</option>
          <option value="ADMIN">Administrateur</option>
        </select>
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <input
            id="actif"
            type="checkbox"
            checked={actif}
            onChange={(e) => setActif(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            data-testid="user-actif"
          />
          <label htmlFor="actif" className="text-sm text-zinc-700 dark:text-zinc-300">
            Compte actif
          </label>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          data-testid="user-submit"
        >
          {pending
            ? "Enregistrement…"
            : mode === "create"
              ? "Créer l'utilisateur"
              : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/users")}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
