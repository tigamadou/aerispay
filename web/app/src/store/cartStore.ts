"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartItem {
  produitId: string;
  nom: string;
  prixUnitaire: number;
  quantite: number;
  remiseLigne: number;
}

export interface TaxeConfig {
  nom: string;
  taux: number;
}

export interface TaxeDetail {
  nom: string;
  taux: number;
  montant: number;
}

interface CartState {
  items: CartItem[];
  remiseGlobale: number;
  typeRemise: "pourcentage" | "fixe";
  taxes: TaxeConfig[];
}

interface CartActions {
  addItem: (product: {
    id: string;
    nom: string;
    prixVente: number;
  }) => void;
  updateQuantity: (produitId: string, quantite: number) => void;
  removeItem: (produitId: string) => void;
  setRemise: (value: number, type: "pourcentage" | "fixe") => void;
  setTaxes: (taxes: TaxeConfig[]) => void;
  clearCart: () => void;
}

interface CartComputed {
  sousTotal: () => number;
  montantRemise: () => number;
  detailTaxes: () => TaxeDetail[];
  montantTaxes: () => number;
  total: () => number;
  getRemiseFixe: () => number;
}

type CartStore = CartState & CartActions & CartComputed;

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      remiseGlobale: 0,
      typeRemise: "pourcentage",
      taxes: [],

      addItem: (product) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.produitId === product.id
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.produitId === product.id
                  ? { ...i, quantite: i.quantite + 1 }
                  : i
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                produitId: product.id,
                nom: product.nom,
                prixUnitaire: Number(product.prixVente),
                quantite: 1,
                remiseLigne: 0,
              },
            ],
          };
        }),

      updateQuantity: (produitId, quantite) =>
        set((state) => {
          if (quantite <= 0) {
            return { items: state.items.filter((i) => i.produitId !== produitId) };
          }
          return {
            items: state.items.map((i) =>
              i.produitId === produitId ? { ...i, quantite } : i
            ),
          };
        }),

      removeItem: (produitId) =>
        set((state) => ({
          items: state.items.filter((i) => i.produitId !== produitId),
        })),

      setRemise: (value, type) =>
        set({ remiseGlobale: value, typeRemise: type }),

      setTaxes: (taxes) => set({ taxes }),

      clearCart: () =>
        set({ items: [], remiseGlobale: 0, typeRemise: "pourcentage" }),

      sousTotal: () => {
        return Math.round(get().items.reduce((sum, item) => {
          const lineSub =
            item.prixUnitaire * item.quantite * (1 - item.remiseLigne / 100);
          return sum + lineSub;
        }, 0));
      },

      montantRemise: () => {
        const st = get().sousTotal();
        const { remiseGlobale, typeRemise } = get();
        const raw = typeRemise === "pourcentage"
          ? st * (remiseGlobale / 100)
          : remiseGlobale;
        return Math.round(raw);
      },

      detailTaxes: () => {
        const st = get().sousTotal();
        const remise = get().montantRemise();
        const base = Math.max(0, st - remise);
        return get().taxes.map((t) => ({
          nom: t.nom,
          taux: t.taux,
          montant: Math.round(base * (t.taux / 100)),
        }));
      },

      montantTaxes: () => {
        return get().detailTaxes().reduce((sum, t) => sum + t.montant, 0);
      },

      total: () => {
        return Math.round(get().sousTotal() - get().montantRemise() + get().montantTaxes());
      },

      getRemiseFixe: () => {
        return get().montantRemise();
      },
    }),
    {
      name: "aerispay-cart",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
