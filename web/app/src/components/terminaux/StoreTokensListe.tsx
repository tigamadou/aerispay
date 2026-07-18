"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Token {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function StoreTokensListe({ terminalId, canManage }: { terminalId: string; canManage: boolean }) {
  const router = useRouter();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/terminaux/${terminalId}/tokens`);
    if (res.ok) setTokens((await res.json()).data);
    setLoading(false);
  }, [terminalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(tokenId: string) {
    const res = await fetch(`/api/terminaux/${terminalId}/tokens/${tokenId}`, { method: "DELETE" });
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      // Re-render le server component parent → réactive le bouton d'enrôlement
      // (le terminal n'est plus associé à un poste).
      router.refresh();
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Chargement des jetons…</p>;
  if (tokens.length === 0) return <p className="text-sm text-zinc-500">Aucun jeton actif.</p>;

  return (
    <ul className="space-y-2">
      {tokens.map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
          <span>{t.label ?? t.id}</span>
          {canManage && (
            <button onClick={() => revoke(t.id)} className="text-red-600 hover:underline">
              Révoquer
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
