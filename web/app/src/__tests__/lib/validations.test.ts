import { describe, it, expect } from "vitest";
import { createProductSchema, updateProductSchema } from "@/lib/validations/produit";
import { createMouvementSchema } from "@/lib/validations/mouvement";
import { updateUserSchema } from "@/lib/validations/user";

describe("createProductSchema", () => {
  const valid = {
    nom: "Test", categorieId: "cid123456789012345678901234",
    prixAchat: 100, prixVente: 200, tva: 0, unite: "unité", stockMinimum: 5,
  };

  it("accepts valid data", () => {
    expect(createProductSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects prixVente <= prixAchat", () => {
    const r = createProductSchema.safeParse({ ...valid, prixVente: 50 });
    expect(r.success).toBe(false);
  });

  it("rejects short name", () => {
    const r = createProductSchema.safeParse({ ...valid, nom: "A" });
    expect(r.success).toBe(false);
  });
});

describe("updateProductSchema", () => {
  it("accepts partial updates", () => {
    expect(updateProductSchema.safeParse({ nom: "Updated" }).success).toBe(true);
  });

  it("rejects when both prices given and vente <= achat", () => {
    const r = updateProductSchema.safeParse({ prixAchat: 500, prixVente: 100 });
    expect(r.success).toBe(false);
  });

  it("passes when only one price given", () => {
    expect(updateProductSchema.safeParse({ prixVente: 300 }).success).toBe(true);
  });

  it("accepts nullable image", () => {
    expect(updateProductSchema.safeParse({ image: null }).success).toBe(true);
  });

  it("accepts actif boolean", () => {
    expect(updateProductSchema.safeParse({ actif: false }).success).toBe(true);
  });
});

describe("createMouvementSchema", () => {
  it("rejects PERTE without motif", () => {
    const r = createMouvementSchema.safeParse({
      produitId: "pid", type: "PERTE", quantite: 5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects AJUSTEMENT with short motif", () => {
    const r = createMouvementSchema.safeParse({
      produitId: "pid", type: "AJUSTEMENT", quantite: 5, motif: "ab",
    });
    expect(r.success).toBe(false);
  });

  it("accepts ENTREE without motif", () => {
    const r = createMouvementSchema.safeParse({
      produitId: "pid", type: "ENTREE", quantite: 10,
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const r = createMouvementSchema.safeParse({
      produitId: "pid", type: "INVALID", quantite: 5,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("accepts partial update", () => {
    expect(updateUserSchema.safeParse({ nom: "Alice B" }).success).toBe(true);
  });

  it("accepts actif field", () => {
    expect(updateUserSchema.safeParse({ actif: false }).success).toBe(true);
  });

  it("rejects invalid role", () => {
    const r = updateUserSchema.safeParse({ role: "SUPERADMIN" });
    expect(r.success).toBe(false);
  });

  it("rejects short password", () => {
    const r = updateUserSchema.safeParse({ motDePasse: "short" });
    expect(r.success).toBe(false);
  });
});
