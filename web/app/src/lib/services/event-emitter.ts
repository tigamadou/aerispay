import { prisma } from "@/lib/db";

// ─── Event type constants ───────────────────────────

export const EVENTS = {
  SESSION_OPENED: "EVT-SESSION-OPENED",
  CASH_MOVEMENT_CREATED: "EVT-CASH-MOVEMENT-CREATED",
  SESSION_CLOSURE_REQUESTED: "EVT-SESSION-CLOSURE-REQUESTED",
  SESSION_VALIDATED: "EVT-SESSION-VALIDATED",
  DISCREPANCY_DETECTED: "EVT-DISCREPANCY-DETECTED",
  SESSION_DISPUTED: "EVT-SESSION-DISPUTED",
  SESSION_FORCE_CLOSED: "EVT-SESSION-FORCE-CLOSED",
  SESSION_CORRECTED: "EVT-SESSION-CORRECTED",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

interface EmitParams {
  type: EventType;
  sessionId?: string;
  payload: Record<string, unknown>;
}

/**
 * Emit a business event for future consumption (e.g. by a comptabilité module).
 * Events are persisted in the events_caisse table.
 * This function never throws — event emission must not break the main operation.
 */
export async function emitEvent(params: EmitParams): Promise<void> {
  try {
    await prisma.eventCaisse.create({
      data: {
        type: params.type,
        sessionId: params.sessionId ?? null,
        payload: params.payload,
      },
    });
  } catch (error) {
    console.error("[emitEvent]", error);
  }
}

/**
 * List unconsumed events, ordered by creation time.
 * Used by future consumers (comptabilité module).
 */
export async function listUnconsumedEvents(limit = 100) {
  return prisma.eventCaisse.findMany({
    where: { consumed: false },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Mark events as consumed (after processing by a consumer).
 */
export async function markEventsConsumed(ids: string[]): Promise<void> {
  await prisma.eventCaisse.updateMany({
    where: { id: { in: ids } },
    data: { consumed: true },
  });
}
