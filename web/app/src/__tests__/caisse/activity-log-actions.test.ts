import { describe, it, expect } from "vitest";
import { ACTIONS } from "@/lib/activity-log";

describe("ACTIONS — constantes module caisse", () => {
  const expectedActions = [
    "CASH_MOVEMENT_CREATED",
    "SESSION_CLOSURE_REQUESTED",
    "SESSION_VALIDATED",
    "SESSION_DISPUTED",
    "SESSION_FORCE_CLOSED",
    "SESSION_CORRECTED",
    "BLIND_VALIDATION_SUBMITTED",
    "INTEGRITY_CHECK_PERFORMED",
    "DISCREPANCY_ALERT_TRIGGERED",
  ];

  for (const action of expectedActions) {
    it(`defines ${action}`, () => {
      expect(ACTIONS).toHaveProperty(action);
      expect(ACTIONS[action as keyof typeof ACTIONS]).toBe(action);
    });
  }

  it("still has existing comptoir actions", () => {
    expect(ACTIONS.COMPTOIR_SESSION_OPENED).toBe("COMPTOIR_SESSION_OPENED");
    expect(ACTIONS.COMPTOIR_SESSION_CLOSED).toBe("COMPTOIR_SESSION_CLOSED");
    expect(ACTIONS.SALE_COMPLETED).toBe("SALE_COMPLETED");
    expect(ACTIONS.SALE_CANCELLED).toBe("SALE_CANCELLED");
  });
});
