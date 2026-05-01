import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { seuilCaisse: { findMany: vi.fn() } } }));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) => {
    const defaults: Record<string, number> = {
      THRESHOLD_DISCREPANCY_MINOR: 500,
      THRESHOLD_DISCREPANCY_MAJOR: 5000,
      THRESHOLD_MAX_RECOUNT_ATTEMPTS: 3,
    };
    return defaults[id] ?? 0;
  }),
}));

import { reconcile } from "@/lib/services/reconciliation";

const soldes = [
  { mode: "ESPECES", solde: 78000 },
  { mode: "MOBILE_MONEY_MTN", solde: 12000 },
];

describe("ReconciliationService", () => {
  // RULE-RECONC-001: Perfect match
  it("CASE 1: all agree → VALIDATED, no acceptance needed", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 78000, MOBILE_MONEY_MTN: 12000 },
      { ESPECES: 78000, MOBILE_MONEY_MTN: 12000 },
      0,
    );
    expect(result.outcome).toBe("VALIDATED");
    if (result.outcome === "VALIDATED") {
      expect(result.needsAcceptance).toBe(false);
      expect(result.modes.every((m) => m.ecartFinal === 0)).toBe(true);
    }
  });

  // RULE-RECONC-002: Cashier and validator agree, minor discrepancy with theoretical
  it("CASE 2a: agreement but minor ecart → VALIDATED, no acceptance", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 78300, MOBILE_MONEY_MTN: 12000 },
      { ESPECES: 78300, MOBILE_MONEY_MTN: 12000 },
      0,
    );
    expect(result.outcome).toBe("VALIDATED");
    if (result.outcome === "VALIDATED") {
      expect(result.needsAcceptance).toBe(false);
      const especeMode = result.modes.find((m) => m.mode === "ESPECES");
      expect(especeMode?.ecartFinal).toBe(300);
      expect(especeMode?.categorie).toBe("MINEUR");
    }
  });

  // RULE-RECONC-002: Cashier and validator agree, medium discrepancy
  it("CASE 2b: agreement but medium ecart → VALIDATED, needs acceptance", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 80000, MOBILE_MONEY_MTN: 12000 },
      { ESPECES: 80000, MOBILE_MONEY_MTN: 12000 },
      0,
    );
    expect(result.outcome).toBe("VALIDATED");
    if (result.outcome === "VALIDATED") {
      expect(result.needsAcceptance).toBe(true);
      const especeMode = result.modes.find((m) => m.mode === "ESPECES");
      expect(especeMode?.ecartFinal).toBe(2000);
      expect(especeMode?.categorie).toBe("MOYEN");
    }
  });

  // RULE-RECONC-002: Major discrepancy
  it("CASE 2c: agreement but major ecart → VALIDATED, needs acceptance, MAJEUR", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 90000, MOBILE_MONEY_MTN: 12000 },
      { ESPECES: 90000, MOBILE_MONEY_MTN: 12000 },
      0,
    );
    expect(result.outcome).toBe("VALIDATED");
    if (result.outcome === "VALIDATED") {
      expect(result.needsAcceptance).toBe(true);
      const especeMode = result.modes.find((m) => m.mode === "ESPECES");
      expect(especeMode?.categorie).toBe("MAJEUR");
    }
  });

  // RULE-RECONC-003: Minor disagreement between cashier and validator
  it("CASE 3: minor disagreement → VALIDATED with average", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 78200, MOBILE_MONEY_MTN: 12000 },
      { ESPECES: 78400, MOBILE_MONEY_MTN: 12000 },
      0,
    );
    expect(result.outcome).toBe("VALIDATED");
    if (result.outcome === "VALIDATED") {
      const especeMode = result.modes.find((m) => m.mode === "ESPECES");
      expect(especeMode?.montantReference).toBe(78300); // average
      expect(especeMode?.ecartFinal).toBe(300);
    }
  });

  // RULE-RECONC-004: Significant disagreement → recount
  it("CASE 4a: significant disagreement, first attempt → RECOUNT_NEEDED", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 78000 },
      { ESPECES: 75000 }, // 3000 difference > 500 minor threshold
      0,
    );
    expect(result.outcome).toBe("RECOUNT_NEEDED");
  });

  // RULE-RECONC-004: After max recount → DISPUTED
  it("CASE 4b: significant disagreement after max recounts → DISPUTED", async () => {
    const result = await reconcile(
      soldes,
      { ESPECES: 78000 },
      { ESPECES: 75000 },
      3, // max reached
    );
    expect(result.outcome).toBe("DISPUTED");
  });

  it("handles modes present only in declarations", async () => {
    const result = await reconcile(
      [{ mode: "ESPECES", solde: 50000 }],
      { ESPECES: 50000, CARTE_BANCAIRE: 0 },
      { ESPECES: 50000, CARTE_BANCAIRE: 0 },
      0,
    );
    expect(result.outcome).toBe("VALIDATED");
    if (result.outcome === "VALIDATED") {
      expect(result.modes).toHaveLength(2);
    }
  });
});
