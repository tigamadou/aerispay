/**
 * Lot D — M1 (RULE-SEUIL-001).
 * La catégorisation d'un écart est identique quel que soit le point d'entrée
 * (ouverture, clôture, réconciliation) : une seule fonction `categorizeDiscrepancy`
 * alimentée par les seuils paramétrables (MINEUR + MEDIUM). Zéro valeur en dur.
 */
import { describe, it, expect } from "vitest";
import { categorizeDiscrepancy } from "@/lib/services/reconciliation";

const SEUIL_MINEUR = 500;
const SEUIL_MOYEN = 5000;

describe("Lot D — cohérence de catégorisation des écarts", () => {
  it("catégorise via les bornes MINEUR / MOYEN", () => {
    expect(categorizeDiscrepancy(0, SEUIL_MINEUR, SEUIL_MOYEN)).toBeNull();
    expect(categorizeDiscrepancy(400, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MINEUR");
    expect(categorizeDiscrepancy(500, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MINEUR");
    expect(categorizeDiscrepancy(3000, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MOYEN");
    expect(categorizeDiscrepancy(5000, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MOYEN");
    expect(categorizeDiscrepancy(6000, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MAJEUR");
  });

  it("est symétrique (signe de l'écart sans effet)", () => {
    expect(categorizeDiscrepancy(-3000, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MOYEN");
    expect(categorizeDiscrepancy(-6000, SEUIL_MINEUR, SEUIL_MOYEN)).toBe("MAJEUR");
  });

  it("un même écart donne la même catégorie qu'à l'ouverture et à la réconciliation", () => {
    // Le point d'entrée (ouverture vs réconciliation) ne change pas le résultat :
    // les deux appellent categorizeDiscrepancy avec MINEUR + MEDIUM.
    const ecart = 4200;
    const categorieOuverture = categorizeDiscrepancy(ecart, SEUIL_MINEUR, SEUIL_MOYEN);
    const categorieReconciliation = categorizeDiscrepancy(ecart, SEUIL_MINEUR, SEUIL_MOYEN);
    expect(categorieOuverture).toBe(categorieReconciliation);
    expect(categorieOuverture).toBe("MOYEN");
  });
});
