"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ProduitOption {
  id: string;
  nom: string;
  reference: string;
  stockActuel: number;
}

interface MovementFormProps {
  produits: ProduitOption[];
}

const typeLabels: Record<string, string> = {
  ENTREE: "Entrée (réapprovisionnement)",
  SORTIE: "Sortie (consommation hors vente)",
  AJUSTEMENT: "Ajustement (correction inventaire)",
  PERTE: "Perte (casse, vol, péremption)",
};

export function MovementForm({ produits }: MovementFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  const [produitId, setProduitId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState("ENTREE");
  const [quantite, setQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const [reference, setReference] = useState("");

  const selectedProduit = produits.find((p) => p.id === produitId);
  const needsMotif = type === "AJUSTEMENT" || type === "PERTE";

  const filtered = searchQuery.trim()
    ? produits.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.nom.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q)
        );
      })
    : produits;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectProduct(p: ProduitOption) {
    setProduitId(p.id);
    setSearchQuery(`${p.nom} (${p.reference})`);
    setShowDropdown(false);
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectProduct(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!produitId) {
      setError("Veuillez sélectionner un produit");
      return;
    }

    setPending(true);

    try {
      const res = await fetch("/api/stock/mouvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produitId,
          type,
          quantite: parseInt(quantite),
          motif: motif || undefined,
          reference: reference || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Une erreur est survenue");
        return;
      }

      setSuccess("Mouvement enregistré avec succès");
      setQuantite("");
      setMotif("");
      setReference("");
      setProduitId("");
      setSearchQuery("");
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setPending(false);
    }
  }

  const inputClasses =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Nouveau mouvement
      </h3>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Product autocomplete */}
        <div className="space-y-1.5">
          <label htmlFor="produit-search" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Produit
          </label>
          <div className="relative" ref={dropdownRef}>
            <input
              ref={inputRef}
              id="produit-search"
              type="text"
              required
              autoComplete="off"
              placeholder="Rechercher par nom ou référence..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setProduitId("");
                setShowDropdown(true);
                setHighlightIndex(-1);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleKeyDown}
              className={inputClasses}
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {filtered.slice(0, 20).map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProduct(p)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      i === highlightIndex
                        ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200"
                        : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    } ${p.id === produitId ? "font-medium" : ""}`}
                  >
                    <span>
                      {p.nom}{" "}
                      <span className="text-xs text-zinc-400">({p.reference})</span>
                    </span>
                    <span className="ml-2 shrink-0 text-xs text-zinc-400">
                      Stock: {p.stockActuel}
                    </span>
                  </button>
                ))}
                {filtered.length > 20 && (
                  <p className="px-3 py-2 text-xs text-zinc-400">
                    +{filtered.length - 20} résultats — affinez la recherche
                  </p>
                )}
              </div>
            )}
            {showDropdown && searchQuery.trim() && filtered.length === 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-400 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                Aucun produit trouvé
              </div>
            )}
          </div>
          {selectedProduit && (
            <p className="text-xs text-zinc-500">
              Stock actuel : <span className="font-medium">{selectedProduit.stockActuel}</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="type" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Type de mouvement
          </label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClasses}>
            {Object.entries(typeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="quantite" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Quantité
            {selectedProduit && (type === "SORTIE" || type === "PERTE") && (
              <span className="ml-1 text-zinc-400">(disponible: {selectedProduit.stockActuel})</span>
            )}
          </label>
          <input
            id="quantite"
            type="number"
            required
            min={1}
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className={inputClasses}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reference" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Référence (bon de livraison...)
          </label>
          <input
            id="reference"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputClasses}
          />
        </div>
      </div>

      {needsMotif && (
        <div className="space-y-1.5">
          <label htmlFor="motif" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Motif (obligatoire)
          </label>
          <input
            id="motif"
            type="text"
            required
            minLength={4}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Raison du mouvement..."
            className={inputClasses}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !produitId}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Enregistrer le mouvement"}
      </button>
    </form>
  );
}
