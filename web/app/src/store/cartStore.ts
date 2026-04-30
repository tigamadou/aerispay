"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartItem {
  produitId: string;
  nom: string;
  prixUnitaire: number;
  tva: number;
  quantite: number;
  remiseLigne: number;
}

interface CartState {
  items: CartItem[];
  remiseGlobale: number;
  typeRemise: "pourcentage" | "fixe";
}

interface CartActions {
  addItem: (product: {
    id: string;
    nom: string;
    prixVente: number;
    tva: number;
  }) => void;
  updateQuantity: (produitId: string, quantite: number) => void;
  removeItem: (produitId: string) => void;
  setRemise: (value: number, type: "pourcentage" | "fixe") => void;
  clearCart: () => void;
}

interface CartComputed {
  sousTotal: () => number;
  montantRemise: () => number;
  montantTva: () => number;
  total: () => number;
}

type CartStore = CartState & CartActions & CartComputed;

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      remiseGlobale: 0,
      typeRemise: "pourcentage",

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
                tva: Number(product.tva),
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

      clearCart: () =>
        set({ items: [], remiseGlobale: 0, typeRemise: "pourcentage" }),

      sousTotal: () => {
        return get().items.reduce((sum, item) => {
          const lineSub =
            item.prixUnitaire * item.quantite * (1 - item.remiseLigne / 100);
          return sum + lineSub;
        }, 0);
      },

      montantRemise: () => {
        const st = get().sousTotal();
        const { remiseGlobale, typeRemise } = get();
        return typeRemise === "pourcentage"
          ? st * (remiseGlobale / 100)
          : remiseGlobale;
      },

      montantTva: () => {
        const { items, remiseGlobale, typeRemise } = get();
        const st = get().sousTotal();
        const discountRatio =
          typeRemise === "pourcentage"
            ? 1 - remiseGlobale / 100
            : st > 0
              ? (st - remiseGlobale) / st
              : 1;

        return items.reduce((sum, item) => {
          const lineSub =
            item.prixUnitaire * item.quantite * (1 - item.remiseLigne / 100);
          return sum + lineSub * discountRatio * (item.tva / 100);
        }, 0);
      },

      total: () => {
        return get().sousTotal() - get().montantRemise() + get().montantTva();
      },
    }),
    {
      name: "aerispay-cart",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
