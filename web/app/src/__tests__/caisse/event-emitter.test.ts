import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    eventCaisse: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { emitEvent, listUnconsumedEvents, markEventsConsumed, EVENTS } from "@/lib/services/event-emitter";

describe("EventEmitterService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("EVENTS constants", () => {
    it("defines all required event types", () => {
      expect(EVENTS.SESSION_OPENED).toBe("EVT-SESSION-OPENED");
      expect(EVENTS.CASH_MOVEMENT_CREATED).toBe("EVT-CASH-MOVEMENT-CREATED");
      expect(EVENTS.SESSION_CLOSURE_REQUESTED).toBe("EVT-SESSION-CLOSURE-REQUESTED");
      expect(EVENTS.SESSION_VALIDATED).toBe("EVT-SESSION-VALIDATED");
      expect(EVENTS.DISCREPANCY_DETECTED).toBe("EVT-DISCREPANCY-DETECTED");
      expect(EVENTS.SESSION_DISPUTED).toBe("EVT-SESSION-DISPUTED");
      expect(EVENTS.SESSION_FORCE_CLOSED).toBe("EVT-SESSION-FORCE-CLOSED");
      expect(EVENTS.SESSION_CORRECTED).toBe("EVT-SESSION-CORRECTED");
    });
  });

  describe("emitEvent", () => {
    it("creates an event in the database", async () => {
      await emitEvent({
        type: EVENTS.SESSION_OPENED,
        sessionId: "s-1",
        payload: { caissier: "u-1", fondCaisse: 50000 },
      });

      expect(prisma.eventCaisse.create).toHaveBeenCalledWith({
        data: {
          type: "EVT-SESSION-OPENED",
          sessionId: "s-1",
          payload: { caissier: "u-1", fondCaisse: 50000 },
        },
      });
    });

    it("does not throw on DB error", async () => {
      (prisma.eventCaisse.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
      // Should not throw
      await expect(emitEvent({
        type: EVENTS.SESSION_VALIDATED,
        payload: { test: true },
      })).resolves.toBeUndefined();
    });

    it("passes null sessionId when not provided", async () => {
      await emitEvent({
        type: EVENTS.DISCREPANCY_DETECTED,
        payload: { ecart: -2000 },
      });

      expect(prisma.eventCaisse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sessionId: null }),
      });
    });
  });

  describe("listUnconsumedEvents", () => {
    it("queries unconsumed events ordered by createdAt", async () => {
      (prisma.eventCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await listUnconsumedEvents(50);
      expect(prisma.eventCaisse.findMany).toHaveBeenCalledWith({
        where: { consumed: false },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      expect(result).toEqual([]);
    });
  });

  describe("markEventsConsumed", () => {
    it("updates events as consumed", async () => {
      await markEventsConsumed(["e-1", "e-2"]);
      expect(prisma.eventCaisse.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["e-1", "e-2"] } },
        data: { consumed: true },
      });
    });
  });
});
