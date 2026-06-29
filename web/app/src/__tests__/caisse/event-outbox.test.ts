/**
 * F1.4 — Outbox : les routes métier émettent des EventCaisse transactionnels.
 * Vérifie le câblage de emitEvent sur l'ouverture de session et le mouvement de caisse.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    caisse: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { COMPTOIR_SESSION_OPENED: "COMPTOIR_SESSION_OPENED", CASH_MOVEMENT_CREATED: "CASH_MOVEMENT_CREATED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));
vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
  createMovement: vi.fn().mockResolvedValue({ id: "mv-1" }),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 20000 }]),
}));
vi.mock("@/lib/services/seuils", () => ({ getSeuil: vi.fn().mockResolvedValue(500) }));

const emitEvent = vi.fn();
const EVENTS = {
  SESSION_OPENED: "EVT-SESSION-OPENED",
  CASH_MOVEMENT_CREATED: "EVT-CASH-MOVEMENT-CREATED",
};
vi.mock("@/lib/services/event-emitter", () => ({
  emitEvent: (...args: unknown[]) => emitEvent(...args),
  EVENTS: {
    SESSION_OPENED: "EVT-SESSION-OPENED",
    CASH_MOVEMENT_CREATED: "EVT-CASH-MOVEMENT-CREATED",
    SESSION_CLOSURE_REQUESTED: "EVT-SESSION-CLOSURE-REQUESTED",
    SESSION_VALIDATED: "EVT-SESSION-VALIDATED",
    DISCREPANCY_DETECTED: "EVT-DISCREPANCY-DETECTED",
    SESSION_DISPUTED: "EVT-SESSION-DISPUTED",
    SESSION_FORCE_CLOSED: "EVT-SESSION-FORCE-CLOSED",
    SESSION_CORRECTED: "EVT-SESSION-CORRECTED",
  },
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockUser(role: Role, id = "caissier-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

describe("F1.4 — émission d'événements outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("émet EVT-SESSION-OPENED à l'ouverture de session", async () => {
    const { POST } = await import("@/app/api/comptoir/sessions/route");
    mockUser("CAISSIER");
    (prisma.caisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "caisse-1", active: true }]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "session-1", caisseId: "caisse-1", userId: "caissier-1", statut: "OUVERTE",
            ouvertureAt: new Date(), montantOuvertureCash: 20000, montantOuvertureMobileMoney: 0,
          }),
        },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/comptoir/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 20000 } }),
    }));

    expect(res.status).toBe(201);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: EVENTS.SESSION_OPENED, sessionId: "session-1" }),
    );
  });

  it("émet EVT-CASH-MOVEMENT-CREATED sur un mouvement manuel", async () => {
    const { POST } = await import("@/app/api/comptoir/movements/route");
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", userId: "caissier-1", caisseId: "caisse-1",
    });

    const res = await POST(new Request("http://localhost/api/comptoir/movements", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s-1", type: "APPORT", mode: "ESPECES", montant: 5000, motif: "Apport" }),
    }));

    expect(res.status).toBe(201);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: EVENTS.CASH_MOVEMENT_CREATED, sessionId: "s-1" }),
    );
  });
});
