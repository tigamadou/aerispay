"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useCartStore } from "@/store/cartStore";
import { cn } from "@/lib/utils";
import type { ProduitPOS, CategoriePOS, TaxePOS } from "@/app/(dashboard)/caisse/page";

// ─── Types ───────────────────────────────────────────

interface POSInterfaceProps {
  produits: ProduitPOS[];
  categories: CategoriePOS[];
  sessionId: string;
  readOnly?: boolean;
  taxes?: TaxePOS[];
}

type ModePaiement = "ESPECES" | "CARTE_BANCAIRE" | "MOBILE_MONEY";

interface SaleResult {
  id: string;
  numero: string;
  total: number;
}

// ─── Helpers ─────────────────────────────────────────

function formatMontant(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount)).replace(/\u202F/g, " ")} FCFA`;
}

// ─── POSInterface ────────────────────────────────────

export function POSInterface({ produits, categories, sessionId, readOnly = false, taxes = [] }: POSInterfaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategorie, setSelectedCategorie] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    items,
    addItem,
    updateQuantity,
    removeItem,
    remiseGlobale,
    typeRemise,
    setRemise,
    setTaxes,
    clearCart,
    sousTotal,
    montantRemise,
    detailTaxes,
    montantTaxes,
    total,
  } = useCartStore();

  // Initialize taxes from server config
  useEffect(() => {
    setTaxes(taxes);
  }, [taxes, setTaxes]);

  // Keep search input focused for barcode scanner
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filter products by category and search
  const filteredProduits = produits.filter((p) => {
    if (selectedCategorie && p.categorie.id !== selectedCategorie) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        p.nom.toLowerCase().includes(q) ||
        p.reference.toLowerCase().includes(q) ||
        (p.codeBarres && p.codeBarres.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const query = searchQuery.trim();
      if (!query) return;

      // Search by barcode first, then reference, then name
      const byBarcode = produits.find(
        (p) => p.codeBarres && p.codeBarres.toLowerCase() === query.toLowerCase() && p.actif && p.stockActuel > 0
      );
      if (byBarcode) {
        addItem({ id: byBarcode.id, nom: byBarcode.nom, prixVente: byBarcode.prixVente });
        setSearchQuery("");
        setSearchMessage(null);
        return;
      }

      const byReference = produits.find(
        (p) => p.reference.toLowerCase() === query.toLowerCase() && p.actif && p.stockActuel > 0
      );
      if (byReference) {
        addItem({ id: byReference.id, nom: byReference.nom, prixVente: byReference.prixVente });
        setSearchQuery("");
        setSearchMessage(null);
        return;
      }

      // Search by name — if exactly one active, in-stock match
      const byName = produits.filter(
        (p) => p.nom.toLowerCase().includes(query.toLowerCase()) && p.actif && p.stockActuel > 0
      );
      if (byName.length === 1) {
        addItem({ id: byName[0].id, nom: byName[0].nom, prixVente: byName[0].prixVente });
        setSearchQuery("");
        setSearchMessage(null);
        return;
      }

      if (byName.length > 1) {
        // Multiple matches — let the grid show them, don't clear
        setSearchMessage(null);
        return;
      }

      setSearchMessage("Produit introuvable");
      setSearchQuery("");
    },
    [searchQuery, produits, addItem]
  );

  const handleProductClick = useCallback(
    (product: ProduitPOS) => {
      if (readOnly || !product.actif || product.stockActuel <= 0) return;
      addItem({ id: product.id, nom: product.nom, prixVente: product.prixVente });
      setSearchMessage(null);
    },
    [readOnly, addItem]
  );

  const currentTotal = total();
  const currentSousTotal = sousTotal();
  const currentRemise = montantRemise();
  const currentDetailTaxes = detailTaxes();
  const currentTotalTaxes = montantTaxes();

  return (
    <>
      {readOnly && (
        <div className="shrink-0 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-400">
          Mode consultation — seuls les caissiers peuvent vendre
        </div>
      )}
      <div className="flex flex-1 flex-col min-h-0 gap-4 lg:flex-row">
        {/* LEFT: Search + Product Grid */}
        <div className="flex flex-1 flex-col min-h-0 min-w-0">
          {/* Search Bar (fixed) */}
          <div className="shrink-0 mb-4">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <input
                ref={searchInputRef}
                data-testid="pos-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchMessage(null);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Rechercher un produit (nom, ref, code-barres)..."
                className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                autoComplete="off"
              />
            </div>
            {searchMessage && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{searchMessage}</p>
            )}
          </div>

          {/* Category Tabs (fixed) */}
          <div className="shrink-0 mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategorie(null)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                selectedCategorie === null
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              )}
            >
              Tous
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategorie(cat.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  selectedCategorie === cat.id
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                )}
                style={
                  selectedCategorie !== cat.id && cat.couleur
                    ? { borderLeft: `3px solid ${cat.couleur}` }
                    : undefined
                }
              >
                {cat.nom}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div
            data-testid="pos-grid"
            className="flex-1 overflow-y-auto rounded-lg"
          >
            {filteredProduits.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                Aucun produit trouve.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProduits.map((product) => {
                  const isDisabled = !product.actif || product.stockActuel <= 0;
                  const isLowStock = product.stockActuel > 0 && product.stockActuel <= product.stockMinimum;
                  const isOutOfStock = product.stockActuel <= 0;

                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      disabled={isDisabled}
                      className={cn(
                        "flex flex-col rounded-lg border p-3 text-left transition-all",
                        isDisabled
                          ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                          : "cursor-pointer border-zinc-200 bg-white hover:border-indigo-300 hover:shadow-md active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-indigo-600"
                      )}
                      style={
                        !isDisabled && product.categorie.couleur
                          ? { borderTopColor: product.categorie.couleur, borderTopWidth: "2px" }
                          : undefined
                      }
                    >
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
                        {product.nom}
                      </span>
                      <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {product.reference}
                      </span>
                      <div className="mt-auto flex items-end justify-between pt-2">
                        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          {formatMontant(product.prixVente)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            isOutOfStock
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : isLowStock
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          )}
                        >
                          {isOutOfStock ? "Rupture" : product.stockActuel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart Panel (hidden in read-only) */}
        {!readOnly && (
        <div
          data-testid="pos-cart"
          className="flex w-full min-h-0 flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 lg:w-96 lg:min-w-[24rem]"
        >
          {/* Cart Header (pinned) */}
          <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Panier ({items.length} article{items.length !== 1 ? "s" : ""})
            </h2>
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Vider
              </button>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
            {items.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
                Le panier est vide
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
                {items.map((item) => (
                  <div
                    key={item.produitId}
                    data-testid="pos-cart-item"
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {item.nom}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatMontant(item.prixUnitaire)} / u.
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQuantity(item.produitId, item.quantite - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        aria-label={`Diminuer ${item.nom}`}
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {item.quantite}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.produitId, item.quantite + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        aria-label={`Augmenter ${item.nom}`}
                      >
                        +
                      </button>
                    </div>

                    {/* Line subtotal */}
                    <span className="w-24 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {formatMontant(item.prixUnitaire * item.quantite * (1 - item.remiseLigne / 100))}
                    </span>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.produitId)}
                      className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      aria-label={`Supprimer ${item.nom}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount + Totals (pinned) */}
          <div className="shrink-0 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
            {/* Discount input */}
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                Remise
              </label>
              <input
                type="number"
                min={0}
                value={remiseGlobale || ""}
                onChange={(e) => setRemise(Number(e.target.value) || 0, typeRemise)}
                className="w-20 rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                placeholder="0"
              />
              <select
                value={typeRemise}
                onChange={(e) =>
                  setRemise(remiseGlobale, e.target.value as "pourcentage" | "fixe")
                }
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
              >
                <option value="pourcentage">%</option>
                <option value="fixe">FCFA</option>
              </select>
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Sous-total</span>
                <span>{formatMontant(currentSousTotal)}</span>
              </div>
              {currentRemise > 0 && (
                <div className="flex justify-between text-orange-600 dark:text-orange-400">
                  <span>Remise</span>
                  <span>-{formatMontant(currentRemise)}</span>
                </div>
              )}
              {currentDetailTaxes.map((t) =>
                t.montant > 0 ? (
                  <div key={t.nom} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>{t.nom} ({t.taux}%)</span>
                    <span>{formatMontant(t.montant)}</span>
                  </div>
                ) : null
              )}
              <div className="flex justify-between border-t border-zinc-200 pt-2 text-lg font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-100">
                <span>TOTAL</span>
                <span>{formatMontant(currentTotal)}</span>
              </div>
            </div>
          </div>

          {/* Encaisser Button (pinned) */}
          <div className="shrink-0 px-4 pb-4">
            <button
              data-testid="pos-encaisser"
              disabled={items.length === 0}
              onClick={() => setShowPaymentModal(true)}
              className={cn(
                "w-full rounded-lg py-3 text-base font-semibold transition-colors",
                items.length === 0
                  ? "cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"
              )}
            >
              ENCAISSER
            </button>
          </div>
        </div>
        )}

        {/* Payment Modal */}
        {!readOnly && showPaymentModal && (
          <PaymentModal
            sessionId={sessionId}
            totalAPayer={currentTotal}
            items={items}
            remise={currentRemise}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => {
              clearCart();
              setShowPaymentModal(false);
            }}
          />
        )}
      </div>
    </>
  );
}

// ─── Payment Modal ───────────────────────────────────

interface PaymentModalProps {
  sessionId: string;
  totalAPayer: number;
  items: ReturnType<typeof useCartStore.getState>["items"];
  remise: number;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ sessionId, totalAPayer, items, remise, onClose, onSuccess }: PaymentModalProps) {
  const [modePaiement, setModePaiement] = useState<ModePaiement>("ESPECES");
  const [montantRecu, setMontantRecu] = useState<number>(0);
  const [referenceTransaction, setReferenceTransaction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [peripheralWarning, setPeripheralWarning] = useState<string | null>(null);

  const monnaieARendre = modePaiement === "ESPECES" ? Math.max(0, montantRecu - totalAPayer) : 0;
  const canValidate =
    modePaiement === "ESPECES" ? montantRecu >= totalAPayer : true;

  const handleSubmit = async () => {
    if (isSubmitting || !canValidate) return;

    setIsSubmitting(true);
    setError(null);

    const body = {
      sessionId,
      lignes: items.map((item) => ({
        produitId: item.produitId,
        quantite: item.quantite,
        prixUnitaire: item.prixUnitaire,
        remise: item.remiseLigne,
      })),
      paiements: [
        {
          mode: modePaiement,
          montant: modePaiement === "ESPECES" ? montantRecu : totalAPayer,
          ...(referenceTransaction ? { reference: referenceTransaction } : {}),
        },
      ],
      remise,
    };

    try {
      const response = await fetch("/api/ventes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Erreur lors de la creation de la vente");
        setIsSubmitting(false);
        return;
      }

      const sale: SaleResult = {
        id: result.data?.id ?? result.id,
        numero: result.data?.numero ?? result.numero,
        total: totalAPayer,
      };
      setSaleResult(sale);

      // Auto-print receipt (fire-and-forget)
      fetch(`/api/tickets/${sale.id}/print`, { method: "POST" })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            console.error("[AUTO-PRINT] Echec impression ticket", { venteId: sale.id, status: res.status, error: body.error });
            setPeripheralWarning("Echec de l'impression du ticket. La vente a bien ete enregistree.");
          }
        })
        .catch((err) => {
          console.error("[AUTO-PRINT] Erreur reseau impression ticket", { venteId: sale.id, error: err });
          setPeripheralWarning("Impossible de communiquer avec l'imprimante. La vente a bien ete enregistree.");
        });

      // If ESPECES, open the cash drawer (fire-and-forget)
      if (modePaiement === "ESPECES") {
        fetch("/api/cash-drawer/open", { method: "POST" }).catch(() => {
          // Cash drawer errors are non-blocking
        });
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async (saleId: string) => {
    try {
      const res = await fetch(`/api/tickets/${saleId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[PDF] Echec generation PDF", { venteId: saleId, status: res.status, error: body.error });
        setPeripheralWarning("Echec de la generation du PDF. La vente a bien ete enregistree.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke after a delay to allow the browser to load it
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error("[PDF] Erreur reseau generation PDF", { venteId: saleId, error: err });
      setPeripheralWarning("Impossible de generer le PDF. La vente a bien ete enregistree.");
    }
  };

  const handlePrint = async (saleId: string) => {
    try {
      const res = await fetch(`/api/tickets/${saleId}/print`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[PRINT] Echec impression ticket", { venteId: saleId, status: res.status, error: body.error });
        setPeripheralWarning("Echec de l'impression du ticket. La vente a bien ete enregistree.");
      }
    } catch (err) {
      console.error("[PRINT] Erreur reseau impression ticket", { venteId: saleId, error: err });
      setPeripheralWarning("Impossible de communiquer avec l'imprimante. La vente a bien ete enregistree.");
    }
  };

  // Success view
  if (saleResult) {
    return (
      <div
        data-testid="pos-payment-modal"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onSuccess();
          }
        }}
      >
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Vente enregistree
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              N° {saleResult.numero} — {formatMontant(saleResult.total)}
            </p>

            {peripheralWarning && (
              <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                {peripheralWarning}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => handleDownloadPdf(saleResult.id)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Telecharger PDF
              </button>
              <button
                onClick={() => handlePrint(saleResult.id)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Imprimer
              </button>
              <button
                onClick={onSuccess}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment form view
  return (
    <div
      data-testid="pos-payment-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Encaissement
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Total */}
        <div className="mb-6 rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Total a payer</p>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {formatMontant(totalAPayer)}
          </p>
        </div>

        {/* Payment mode selector */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Mode de paiement
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "ESPECES", label: "Especes" },
                { value: "CARTE_BANCAIRE", label: "Carte" },
                { value: "MOBILE_MONEY", label: "Mobile" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setModePaiement(value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  modePaiement === value
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-indigo-400"
                    : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ESPECES: amount received */}
        {modePaiement === "ESPECES" && (
          <div className="mb-5 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Montant recu
              </label>
              <input
                type="number"
                min={0}
                value={montantRecu || ""}
                onChange={(e) => setMontantRecu(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="flex justify-between rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Monnaie a rendre
              </span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {formatMontant(monnaieARendre)}
              </span>
            </div>
          </div>
        )}

        {/* CARD / MOBILE: reference */}
        {(modePaiement === "CARTE_BANCAIRE" || modePaiement === "MOBILE_MONEY") && (
          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Reference transaction (optionnel)
            </label>
            <input
              type="text"
              value={referenceTransaction}
              onChange={(e) => setReferenceTransaction(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
              placeholder="Ex: TXN-12345"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Validate button */}
        <button
          data-testid="pos-payment-validate"
          disabled={!canValidate || isSubmitting}
          onClick={handleSubmit}
          className={cn(
            "w-full rounded-lg py-3 text-base font-semibold transition-colors",
            !canValidate || isSubmitting
              ? "cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500"
              : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"
          )}
        >
          {isSubmitting ? "Validation..." : "Valider"}
        </button>
      </div>
    </div>
  );
}
