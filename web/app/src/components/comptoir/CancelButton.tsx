"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CancelButtonProps {
  venteId: string;
}

export function CancelButtonClient({ venteId }: CancelButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleCancel() {
    if (!confirm("Êtes-vous sûr de vouloir annuler cette vente ? Le stock sera restauré.")) {
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/ventes/${venteId}/annuler`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Erreur lors de l'annulation");
      }
    } catch {
      toast.error("Erreur de connexion au serveur");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={pending}
      className="text-red-600 hover:text-red-800 dark:text-red-400 text-xs font-medium disabled:opacity-50"
    >
      {pending ? "…" : "Annuler"}
    </button>
  );
}
