import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ---- Mocks ----

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn() },
    seuilCaisse: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual("@/lib/permissions");
  return {
    ...actual,
    requireAuth: vi.fn(),
  };
});

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
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([
    { mode: "ESPECES", solde: 50000 },
  ]),
}));

vi.mock("@/lib/services/reconciliation", () => ({
  reconcile: vi.fn().mockResolvedValue({
    outcome: "VALIDATED",
    modes: [
      {
        mode: "ESPECES",
        theorique: 50000,
        declareCaissier: 50000,
        declareValideur: 50000,
        montantReference: 50000,
        ecartCaissierValideur: 0,
        ecartFinal: 0,
        categorie: null,
      },
    ],
    needsAcceptance: false,
  }),
}));

vi.mock("@/lib/services/integrity", () => ({
  computeHashForSession: vi.fn().mockResolvedValue("h".repeat(64)),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

// ---- Helpers ----

function mockAuthAs(role: Role, id: string) {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id, email: `${id}@test.com`, name: "Test", role },
  });
}

function makeReq(): Request {
  return new Request("http://localhost/api/comptoir/sessions/sess-1/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ declarations: { ESPECES: 50000 } }),
  });
}

const sessionRecord = {
  id: "sess-1",
  statut: "EN_ATTENTE_VALIDATION",
  userId: "caissier-b", // owned by CAISSIER B
  declarationsCaissier: { ESPECES: 50000 },
  tentativesRecomptage: 0,
};

const updatedSession = {
  ...sessionRecord,
  statut: "VALIDEE",
  user: { id: "caissier-b", nom: "Caissier B", email: "b@test.com" },
};

// ---- Tests ----

describe("POST /api/comptoir/sessions/[id]/validate — role checks (P2-007)", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    POST = (await import("@/app/api/comptoir/sessions/[id]/validate/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sessionRecord);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedSession);
  });

  it("CAISSIER A ne peut pas valider la session de CAISSIER B → 403", async () => {
    mockAuthAs("CAISSIER", "caissier-a");

    const res = await POST(makeReq(), { params: Promise.resolve({ id: "sess-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/MANAGER|ADMIN/i);
  });

  it("MANAGER peut valider la session de CAISSIER B → 200", async () => {
    mockAuthAs("MANAGER", "manager-1");

    const res = await POST(makeReq(), { params: Promise.resolve({ id: "sess-1" }) });
    expect(res.status).toBe(200);
  });

  it("ADMIN peut valider la session de CAISSIER B → 200", async () => {
    mockAuthAs("ADMIN", "admin-1");

    const res = await POST(makeReq(), { params: Promise.resolve({ id: "sess-1" }) });
    expect(res.status).toBe(200);
  });
});
