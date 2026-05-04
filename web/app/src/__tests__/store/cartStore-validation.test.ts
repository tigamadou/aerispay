import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore } from "@/store/cartStore";

describe("cartStore — validation remise globale (P2-006)", () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  it("plafonne un pourcentage > 100 a 100", () => {
    useCartStore.getState().setRemise(150, "pourcentage");
    expect(useCartStore.getState().remiseGlobale).toBe(100);
  });

  it("plafonne un pourcentage negatif a 0", () => {
    useCartStore.getState().setRemise(-20, "pourcentage");
    expect(useCartStore.getState().remiseGlobale).toBe(0);
  });

  it("laisse passer un pourcentage valide (50)", () => {
    useCartStore.getState().setRemise(50, "pourcentage");
    expect(useCartStore.getState().remiseGlobale).toBe(50);
  });

  it("plafonne une remise fixe negative a 0", () => {
    useCartStore.getState().setRemise(-10, "fixe");
    expect(useCartStore.getState().remiseGlobale).toBe(0);
  });

  it("laisse passer une remise fixe positive", () => {
    useCartStore.getState().setRemise(500, "fixe");
    expect(useCartStore.getState().remiseGlobale).toBe(500);
  });

  it("ne produit pas un total negatif avec pourcentage a 100", () => {
    useCartStore.getState().addItem({ id: "p1", nom: "Test", prixVente: 1000 });
    useCartStore.getState().setRemise(100, "pourcentage");
    expect(useCartStore.getState().total()).toBe(0);
  });
});
