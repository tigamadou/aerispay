/**
 * C2.1 — Construction du contenu réel du ticket (ESC/POS texte).
 * Remplace le STUB de printReceipt : buildReceiptContent transforme une vente en
 * lignes de texte imprimables, fonction pure et testable.
 */
import { describe, it, expect } from "vitest";
import { buildReceiptContent } from "@/lib/receipt/receipt-content";
import type { ReceiptContentData } from "@/lib/receipt/receipt-content";

const data: ReceiptContentData = {
  business: { name: "AerisShop", address: "Cotonou", phone: "+229 0190000000", rccm: "RB-123", nif: "NIF-9" },
  sale: {
    numero: "VTE-P1-2026-00007",
    dateVente: new Date("2026-06-26T10:30:00Z"),
    caissierNom: "Awa",
    lignes: [
      { nom: "Café 250g", quantite: 2, prixUnitaire: 1500, sousTotal: 3000 },
      { nom: "Sucre 1kg", quantite: 1, prixUnitaire: 800, sousTotal: 800 },
    ],
    sousTotal: 3800,
    remise: 300,
    taxesDetail: [{ nom: "TVA", taux: 18, montant: 630 }],
    total: 4130,
    paiements: [{ mode: "ESPECES", montant: 4130 }],
  },
};

describe("C2.1 — buildReceiptContent", () => {
  it("inclut l'en-tête commerce, le numéro et le caissier", () => {
    const lines = buildReceiptContent(data, 48);
    const text = lines.join("\n");
    expect(text).toContain("AerisShop");
    expect(text).toContain("VTE-P1-2026-00007");
    expect(text).toContain("Awa");
    expect(text).toContain("RB-123");
  });

  it("liste chaque produit avec quantité et sous-total", () => {
    const lines = buildReceiptContent(data, 48);
    const text = lines.join("\n");
    expect(text).toContain("Café 250g");
    expect(text).toContain("Sucre 1kg");
    expect(text).toMatch(/2\s*x/); // quantité
  });

  it("affiche sous-total, remise, taxes et total", () => {
    const lines = buildReceiptContent(data, 48);
    const text = lines.join("\n");
    expect(text).toMatch(/Sous-total/i);
    expect(text).toMatch(/Remise/i);
    expect(text).toContain("TVA");
    expect(text).toMatch(/TOTAL/i);
    expect(text).toContain("4 130");
  });

  it("affiche les paiements avec libellé lisible", () => {
    const lines = buildReceiptContent(data, 48);
    const text = lines.join("\n");
    expect(text).toContain("Cash"); // ESPECES → Cash
  });

  it("ne dépasse pas la largeur configurée", () => {
    const lines = buildReceiptContent(data, 32);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(32);
    }
  });

  it("omet la ligne remise si remise = 0", () => {
    const noRemise = { ...data, sale: { ...data.sale, remise: 0 } };
    const text = buildReceiptContent(noRemise, 48).join("\n");
    expect(text).not.toMatch(/Remise/i);
  });
});
