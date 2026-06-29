/**
 * Lot G — RULE-FOND-003 (Modèle 2) câblée à la validation.
 * Quand la session est VALIDÉE, une levée des recettes vers le coffre est déclenchée
 * (mouvements LEVEE) AVANT le calcul du hash d'intégrité, pour que celui-ci l'inclue.
 * Le float par mode provient de la config (FLOAT_<MODE>, défaut 0).
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
  leverRecettesInTx: vi.fn().mockResolvedValue([{ mode: "ESPECES", montant: -78000 }]),
}));

vi.mock("@/lib/services/reconciliation", async () => {
  const actual = await vi.importActual("@/lib/services/reconciliation");
  return actual;
});

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) =>
    ({ THRESHOLD_DISCREPANCY_MINOR: 500, THRESHOLD_DISCREPANCY_MAJOR: 5000, THRESHOLD_MAX_RECOUNT_ATTEMPTS: 3, THRESHOLD_CV_TOLERANCE: 500 } as Record<string, number>)[id] ?? 0,
  ),
  getSeuilOrZero: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/services/integrity", () => ({
  computeHashForSession: vi.fn().mockResolvedValue("a".repeat(64)),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { leverRecettesInTx } from "@/lib/services/cash-movement";

function mockUser(role: Role, id = "manager-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

const pendingSession = {
  id: "s-1", statut: "EN_ATTENTE_VALIDATION", userId: "caissier-1",
  declarationsCaissier: { ESPECES: 78000 }, tentativesRecomptage: 0,
  caisseId: "caisse-1",
};
const ctx = { params: Promise.resolve({ id: "s-1" }) };

describe("Lot G — levée déclenchée à la validation", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
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

  it("déclenche leverRecettesInTx sur VALIDATED (caissier ≡ valideur)", async () => {
    mockUser("MANAGER", "manager-1");
    const res = await POST(new Request("http://localhost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 78000 } }),
    }), ctx);

    expect(res.status).toBe(200);
    expect(leverRecettesInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sessionId: "s-1", caisseId: "caisse-1", auteurId: "manager-1" }),
    );
  });

  it("ne lève pas si la session n'est pas validée (RECOUNT/DISPUTED non concernés)", async () => {
    mockUser("MANAGER", "manager-1");
    // déclaration valideur très différente -> recount/disputed, pas de levée
    const res = await POST(new Request("http://localhost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 200000 } }),
    }), ctx);

    expect(res.status).toBe(409);
    expect(leverRecettesInTx).not.toHaveBeenCalled();
  });
});
