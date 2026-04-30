"use client";

import { useState } from "react";
import Link from "next/link";

interface UserRow {
  id: string;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  createdAt: string;
}

interface UsersTableProps {
  initialUsers: UserRow[];
  totalUsers: number;
  page: number;
  pageSize: number;
}

const roleLabel: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gérant",
  CAISSIER: "Caissier",
};

export function UsersTable({ initialUsers, totalUsers, page, pageSize }: UsersTableProps) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [users, setUsers] = useState(initialUsers);
  const totalPages = Math.ceil(totalUsers / pageSize);

  async function toggleActive(userId: string, currentActive: boolean) {
    setToggling(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !currentActive }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, actif: !currentActive } : u))
        );
      }
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((user) => (
              <tr key={user.id} className="text-zinc-700 dark:text-zinc-300">
                <td className="px-4 py-3 font-medium">{user.nom}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {roleLabel[user.role] ?? user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.actif
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    }`}
                  >
                    {user.actif ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/users/${user.id}`}
                      className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-xs font-medium"
                    >
                      Modifier
                    </Link>
                    <button
                      onClick={() => toggleActive(user.id, user.actif)}
                      disabled={toggling === user.id}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 disabled:opacity-50"
                    >
                      {toggling === user.id
                        ? "…"
                        : user.actif
                          ? "Désactiver"
                          : "Activer"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            Page {page} sur {totalPages} ({totalUsers} utilisateur{totalUsers > 1 ? "s" : ""})
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/users?page=${page - 1}`}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/users?page=${page + 1}`}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
