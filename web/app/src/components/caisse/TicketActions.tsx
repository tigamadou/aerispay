"use client";

import { useState } from "react";

interface TicketActionsProps {
  venteId: string;
}

export function TicketActions({ venteId }: TicketActionsProps) {
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handlePrint = async () => {
    setPrinting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tickets/${venteId}/print`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[PRINT] Echec impression ticket", { venteId, status: res.status, error: body.error });
        setMessage({ type: "error", text: body.error ?? "Echec de l'impression du ticket." });
        return;
      }
      setMessage({ type: "success", text: "Ticket envoye a l'imprimante." });
    } catch (err) {
      console.error("[PRINT] Erreur reseau impression ticket", { venteId, error: err });
      setMessage({ type: "error", text: "Impossible de communiquer avec l'imprimante." });
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tickets/${venteId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[PDF] Echec generation PDF", { venteId, status: res.status, error: body.error });
        setMessage({ type: "error", text: body.error ?? "Echec de la generation du PDF." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error("[PDF] Erreur reseau generation PDF", { venteId, error: err });
      setMessage({ type: "error", text: "Impossible de generer le PDF." });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {downloading ? "Generation..." : "Telecharger PDF"}
        </button>
        <button
          onClick={handlePrint}
          disabled={printing}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {printing ? "Impression..." : "Imprimer"}
        </button>
      </div>
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
    </div>
  );
}
