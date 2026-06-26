/**
 * S4.2 — Worker push transactionnel : outbox EventCaisse → cloud.
 * Lit les événements non consommés (ordre createdAt), les pousse au cloud par lots,
 * marque `consumed` après accusé. Idempotent (rejeu sans duplication) et résilient
 * (en cas d'échec transport, rien n'est marqué consommé → rejeu ultérieur).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const listUnconsumedEvents = vi.fn();
const markEventsConsumed = vi.fn();
vi.mock("@/lib/services/event-emitter", () => ({
  listUnconsumedEvents: (...a: unknown[]) => listUnconsumedEvents(...a),
  markEventsConsumed: (...a: unknown[]) => markEventsConsumed(...a),
}));

import { pushTransactionalEvents } from "@/lib/services/cloud-sync";
import type { CloudSyncTransport } from "@/lib/services/cloud-sync";

function makeEvents(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e-${i + 1}`,
    type: "EVT-SESSION-OPENED",
    sessionId: `s-${i + 1}`,
    payload: {},
    consumed: false,
    createdAt: new Date(`2026-01-01T00:0${i}:00Z`),
  }));
}

describe("S4.2 — pushTransactionalEvents", () => {
  beforeEach(() => {
    listUnconsumedEvents.mockReset();
    markEventsConsumed.mockReset();
  });

  it("pousse les événements non consommés et les marque consommés après accusé", async () => {
    const events = makeEvents(3);
    listUnconsumedEvents.mockResolvedValueOnce(events).mockResolvedValueOnce([]);
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn().mockResolvedValue({ ackedIds: ["e-1", "e-2", "e-3"] }),
    };

    const result = await pushTransactionalEvents(transport, { batchSize: 50 });

    expect(transport.pushEvents).toHaveBeenCalledWith(events);
    expect(markEventsConsumed).toHaveBeenCalledWith(["e-1", "e-2", "e-3"]);
    expect(result.pushed).toBe(3);
    expect(result.acked).toBe(3);
  });

  it("ne marque rien consommé si le transport échoue (résilience WAN)", async () => {
    const events = makeEvents(2);
    listUnconsumedEvents.mockResolvedValueOnce(events);
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn().mockRejectedValue(new Error("WAN down")),
    };

    const result = await pushTransactionalEvents(transport, { batchSize: 50 });

    expect(markEventsConsumed).not.toHaveBeenCalled();
    expect(result.acked).toBe(0);
    expect(result.failed).toBe(true);
  });

  it("ne marque consommés que les ids accusés (accusé partiel)", async () => {
    const events = makeEvents(3);
    listUnconsumedEvents.mockResolvedValueOnce(events).mockResolvedValueOnce([]);
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn().mockResolvedValue({ ackedIds: ["e-1", "e-3"] }),
    };

    await pushTransactionalEvents(transport, { batchSize: 50 });

    expect(markEventsConsumed).toHaveBeenCalledWith(["e-1", "e-3"]);
  });

  it("ne fait rien (et n'appelle pas le transport) s'il n'y a aucun événement", async () => {
    listUnconsumedEvents.mockResolvedValueOnce([]);
    const transport: CloudSyncTransport = { pushEvents: vi.fn() };

    const result = await pushTransactionalEvents(transport, { batchSize: 50 });

    expect(transport.pushEvents).not.toHaveBeenCalled();
    expect(result.pushed).toBe(0);
  });

  it("traite plusieurs lots jusqu'à épuisement de l'outbox", async () => {
    listUnconsumedEvents
      .mockResolvedValueOnce(makeEvents(2))
      .mockResolvedValueOnce(makeEvents(1))
      .mockResolvedValueOnce([]);
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn()
        .mockResolvedValueOnce({ ackedIds: ["e-1", "e-2"] })
        .mockResolvedValueOnce({ ackedIds: ["e-1"] }),
    };

    const result = await pushTransactionalEvents(transport, { batchSize: 2 });

    expect(transport.pushEvents).toHaveBeenCalledTimes(2);
    expect(result.pushed).toBe(3);
    expect(result.acked).toBe(3);
    expect(result.batches).toBe(2);
  });
});
