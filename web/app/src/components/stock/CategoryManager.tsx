"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CategorieRow {
  id: string;
  nom: string;
  description: string | null;
  couleur: string | null;
  _count: { produits: number };
}

interface CategoryManagerProps {
  categories: CategorieRow[];
}

export function CategoryManager({ categories: initialCategories }: CategoryManagerProps) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [couleur, setCouleur] = useState("#6366f1");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCouleur, setEditCouleur] = useState("");

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, description: description || undefined, couleur }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Une erreur est survenue");
        return;
      }

      const { data } = await res.json();
      setCategories((prev) => [...prev, data]);
      setNom("");
      setDescription("");
      setCouleur("#6366f1");
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setPending(false);
    }
  }

  async function handleUpdate(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: editNom,
          description: editDescription || null,
          couleur: editCouleur,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Une erreur est survenue");
        return;
      }

      const { data } = await res.json();
      setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
      setEditingId(null);
    } catch {
      setError("Erreur de connexion au serveur");
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setError("");

    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Une erreur est survenue");
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setDeleting(null);
    }
  }

  function startEdit(cat: CategorieRow) {
    setEditingId(cat.id);
    setEditNom(cat.nom);
    setEditDescription(cat.description ?? "");
    setEditCouleur(cat.couleur ?? "#6366f1");
  }

  const inputClasses =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Nouvelle catégorie
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            placeholder="Nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className={inputClasses}
          />
          <input
            type="text"
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClasses}
          />
          <input
            type="color"
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-zinc-300 dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "..." : "Ajouter"}
          </button>
        </div>
      </form>

      {/* Category list */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Couleur</th>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium text-right">Produits</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categories.map((cat) => (
              <tr key={cat.id} className="text-zinc-700 dark:text-zinc-300">
                {editingId === cat.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input type="color" value={editCouleur} onChange={(e) => setEditCouleur(e.target.value)} className="h-8 w-8 cursor-pointer rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" required value={editNom} onChange={(e) => setEditNom(e.target.value)} className={inputClasses} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={inputClasses} />
                    </td>
                    <td className="px-4 py-3 text-right">{cat._count.produits}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdate(cat.id)}
                          className="text-xs font-medium text-green-600 hover:text-green-800"
                        >
                          Sauver
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
                        >
                          Annuler
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block h-5 w-5 rounded-full border border-zinc-200 dark:border-zinc-700"
                        style={{ backgroundColor: cat.couleur ?? "#6366f1" }}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{cat.nom}</td>
                    <td className="px-4 py-3 text-zinc-500">{cat.description ?? "-"}</td>
                    <td className="px-4 py-3 text-right">{cat._count.produits}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(cat)}
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-xs font-medium"
                        >
                          Modifier
                        </button>
                        {cat._count.produits === 0 && (
                          <button
                            onClick={() => handleDelete(cat.id)}
                            disabled={deleting === cat.id}
                            className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            {deleting === cat.id ? "..." : "Supprimer"}
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Aucune catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
