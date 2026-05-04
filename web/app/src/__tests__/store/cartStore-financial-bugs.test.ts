/**
 * P1-004: FCFA rounding in cartStore.
 * P1-005: Remise percentage vs fixed inconsistency — getRemiseFixe().
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore } from "@/store/cartStore";

beforeEach(() => {
  useCartStore.getState().clearCart();
  useCartStore.getState().setTaxes([]);
});

describe("P1-004: FCFA rounding in cartStore", () => {
  it("total() returns an integer for product at 1001 FCFA with 33% remise", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 1001 });
    useCartStore.getState().setRemise(33, "pourcentage");

    const total = useCartStore.getState().total();
    expect(Number.isInteger(total)).toBe(true);
  });

  it("sousTotal() returns an integer", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 333 });
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 333 }); // qty=2
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 333 }); // qty=3

    const sousTotal = useCartStore.getState().sousTotal();
    expect(Number.isInteger(sousTotal)).toBe(true);
  });

  it("montantRemise() returns an integer", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 1001 });
    useCartStore.getState().setRemise(33, "pourcentage");

    const remise = useCartStore.getState().montantRemise();
    expect(Number.isInteger(remise)).toBe(true);
  });

  it("total with taxes is also an integer", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 999 });
    useCartStore.getState().setTaxes([{ nom: "TVA", taux: 18 }]);
    useCartStore.getState().setRemise(7, "pourcentage");

    const total = useCartStore.getState().total();
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe("P1-005: getRemiseFixe() for consistent API submission", () => {
  it("returns fixed value when remise type is pourcentage", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 5000 });
    useCartStore.getState().setRemise(10, "pourcentage");

    const remiseFixe = useCartStore.getState().getRemiseFixe();
    expect(remiseFixe).toBe(500);
  });

  it("returns the same value when remise type is fixe", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 5000 });
    useCartStore.getState().setRemise(300, "fixe");

    const remiseFixe = useCartStore.getState().getRemiseFixe();
    expect(remiseFixe).toBe(300);
  });

  it("returns 0 when no remise set", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 5000 });

    const remiseFixe = useCartStore.getState().getRemiseFixe();
    expect(remiseFixe).toBe(0);
  });

  it("returns rounded integer", () => {
    useCartStore.getState().addItem({ id: "p-1", nom: "Test", prixVente: 1001 });
    useCartStore.getState().setRemise(33, "pourcentage");

    const remiseFixe = useCartStore.getState().getRemiseFixe();
    expect(Number.isInteger(remiseFixe)).toBe(true);
    // 1001 * 33/100 = 330.33 → rounded to 330
    expect(remiseFixe).toBe(330);
  });
});
