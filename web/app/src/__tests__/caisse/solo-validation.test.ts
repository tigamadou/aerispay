/**
 * F1.5 — RULE-FOND-005 : caissier solo.
 * Quand le mode solo est activé (THRESHOLD_SOLO_AUTO_VALIDATION > 0), le caissier
 * peut auto-valider sa propre session tant que l'écart final reste sous le seuil.
 * Au-delà → clôture différée (validation par un tiers requise). Désactivé → 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
    caisse: { findFirst: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    BLIND_VALIDATION_SUBMITTED: "BLIND_VALIDATION_SUBMITTED",
    SESSION_VALIDATED: "SESSION_VALIDATED",
    SESSION_DISPUTED: "SESSION_DISPUTED",
    DISCREPANCY_ALERT_TRIGGERED: "DISCREPANCY_ALERT_TRIGGERED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeSession: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 78000 }]),
  leverRecettesInTx: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/services/reconciliation", async () => {
  const actual = await vi.importActual("@/lib/services/reconciliation");
  return actual;
});

const soloThreshold = { value: 0 };
vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) =>
    ({ THRESHOLD_DISCREPANCY_MINOR: 500, THRESHOLD_DISCREPANCY_MAJOR: 5000, THRESHOLD_MAX_RECOUNT_ATTEMPTS: 3, THRESHOLD_CV_TOLERANCE: 500 } as Record<string, number>)[id] ?? 0,
  ),
  getSeuilOrZero: vi.fn().mockImplementation(async (id: string) =>
    id === "THRESHOLD_SOLO_AUTO_VALIDATION" ? soloThreshold.value : 0,
  ),
}));

vi.mock("@/lib/services/integrity", () => ({
  computeHashForSession: vi.fn().mockResolvedValue("a".repeat(64)),
}));

vi.mock("@/lib/services/event-emitter", () => ({
  emitEvent: vi.fn(),
  EVENTS: { SESSION_VALIDATED: "EVT-SESSION-VALIDATED", DISCREPANCY_DETECTED: "EVT-DISCREPANCY-DETECTED", SESSION_DISPUTED: "EVT-SESSION-DISPUTED" },
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockUser(role: Role, id: string) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const pendingSession = {
  id: "s-1", statut: "EN_ATTENTE_VALIDATION", userId: "caissier-1",
  declarationsCaissier: { ESPECES: 78000 }, tentativesRecomptage: 0, caisseId: "caisse-1",
};
const ctx = { params: Promise.resolve({ id: "s-1" }) };

describe("F1.5 — caissier solo (auto-validation tracée)", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    soloThreshold.value = 0;
    POST = (await import("@/app/api/comptoir/sessions/[id]/validate/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pendingSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...pendingSession, ...data, user: { id: "caissier-1", nom: "C", email: "c@t.com" },
      }),
    );
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("mode solo désactivé (seuil 0) : le caissier ne peut pas valider sa propre session → 403", async () => {
    soloThreshold.value = 0;
    mockUser("CAISSIER", "caissier-1");
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(403);
  });

  it("mode solo activé + écart nul : auto-validation → 200 VALIDEE", async () => {
    soloThreshold.value = 1000;
    mockUser("CAISSIER", "caissier-1");
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("VALIDEE");
  });

  it("mode solo activé mais écart au-delà du seuil → 422 clôture différée", async () => {
    soloThreshold.value = 1000;
    mockUser("CAISSIER", "caissier-1");
    // caissier == valideur (accord) mais écart vs théorique 78000 : 80000 - 78000 = 2000 > seuil 1000
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingSession, declarationsCaissier: { ESPECES: 80000 },
    });
    const res = await POST(jsonReq({ declarations: { ESPECES: 80000 } }), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("SOLO_THRESHOLD_EXCEEDED");
  });
});
