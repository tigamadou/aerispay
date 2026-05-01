import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    seuilCaisse: { findMany: vi.fn() },
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
    SESSION_FORCE_CLOSED: "SESSION_FORCE_CLOSED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([
    { mode: "ESPECES", solde: 78000 },
  ]),
}));

vi.mock("@/lib/services/reconciliation", async () => {
  const actual = await vi.importActual("@/lib/services/reconciliation");
  return actual;
});

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) => {
    const d: Record<string, number> = {
      THRESHOLD_DISCREPANCY_MINOR: 500,
      THRESHOLD_DISCREPANCY_MAJOR: 5000,
      THRESHOLD_MAX_RECOUNT_ATTEMPTS: 3,
    };
    return d[id] ?? 0;
  }),
}));

vi.mock("@/lib/services/integrity", () => ({
  computeHashForSession: vi.fn().mockResolvedValue("a".repeat(64)),
}));

vi.mock("bcryptjs", () => ({
  compare: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockUser(role: Role, id = "manager-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const pendingSession = {
  id: "s-1", statut: "EN_ATTENTE_VALIDATION", userId: "caissier-1",
  declarationsCaissier: { ESPECES: 78000 },
  tentativesRecomptage: 0,
};

const ctx = { params: Promise.resolve({ id: "s-1" }) };

describe("POST /api/comptoir/sessions/[id]/validate", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/validate/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pendingSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...pendingSession, ...data,
        user: { id: "caissier-1", nom: "Caissier", email: "c@t.com" },
      }),
    );
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 if caissier tries to validate own session (RULE-AUTH-003)", async () => {
    mockUser("CAISSIER", "caissier-1"); // same as session owner
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("propre session");
  });

  it("returns 422 if session is not EN_ATTENTE_VALIDATION", async () => {
    mockUser("MANAGER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingSession, statut: "OUVERTE",
    });
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(422);
  });

  it("VALIDATED when cashier and validator agree (RULE-RECONC-001)", async () => {
    mockUser("MANAGER");
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("VALIDEE");
    expect(body.data.reconciliation.outcome).toBe("VALIDATED");
    expect(body.data.hashIntegrite).toMatch(/^[a]{64}$/);
  });

  it("incoming CAISSIER can validate another's session", async () => {
    mockUser("CAISSIER", "caissier-2"); // different from session owner
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("VALIDEE");
  });

  it("RECOUNT_NEEDED when significant disagreement (RULE-RECONC-004)", async () => {
    mockUser("MANAGER");
    const res = await POST(jsonReq({ declarations: { ESPECES: 75000 } }), ctx);
    // 78000 - 75000 = 3000 > 500 minor threshold
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.data.reconciliation.outcome).toBe("RECOUNT_NEEDED");
  });

  it("DISPUTED after max recount attempts (RULE-RECONC-004)", async () => {
    mockUser("MANAGER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingSession, tentativesRecomptage: 3,
    });
    const res = await POST(jsonReq({ declarations: { ESPECES: 75000 } }), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.data.reconciliation.outcome).toBe("DISPUTED");
    expect(body.data.statut).toBe("CONTESTEE");
  });

  it("returns 404 if session not found", async () => {
    mockUser("MANAGER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(jsonReq({ declarations: { ESPECES: 78000 } }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    mockUser("MANAGER");
    const res = await POST(jsonReq({ declarations: {} }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/comptoir/sessions/[id]/force-close", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/force-close/route")).POST;
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      motDePasse: "$2a$12$hashedpassword",
    });
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "CONTESTEE", userId: "caissier-1",
    });
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "s-1", ...data,
        user: { id: "caissier-1", nom: "Caissier", email: "c@t.com" },
      }),
    );
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns 403 if not ADMIN", async () => {
    mockUser("MANAGER");
    const res = await POST(jsonReq({
      motif: "Session abandonnée par le caissier",
      motDePasse: "Admin@1234",
    }), ctx);
    expect(res.status).toBe(403);
  });

  it("ADMIN can force-close a DISPUTED session", async () => {
    mockUser("ADMIN", "admin-1");
    const res = await POST(jsonReq({
      motif: "Désaccord non résolu après recomptages",
      motDePasse: "Admin@1234",
    }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("FORCEE");
    expect(body.data.motifForceClose).toBeDefined();
  });

  it("ADMIN can force-close an OPEN session", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", userId: "caissier-1",
    });
    const res = await POST(jsonReq({
      motif: "Session abandonnée par le caissier en urgence",
      motDePasse: "Admin@1234",
    }), ctx);
    expect(res.status).toBe(200);
  });

  it("returns 422 if session already VALIDATED", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE", userId: "caissier-1",
    });
    const res = await POST(jsonReq({
      motif: "Tentative de force-close sur session validée",
      motDePasse: "Admin@1234",
    }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns 401 if password is incorrect", async () => {
    mockUser("ADMIN", "admin-1");
    const { compare } = await import("bcryptjs");
    (compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await POST(jsonReq({
      motif: "Session abandonnée par le caissier",
      motDePasse: "wrong-password",
    }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for short motif", async () => {
    mockUser("ADMIN", "admin-1");
    const res = await POST(jsonReq({
      motif: "court",
      motDePasse: "Admin@1234",
    }), ctx);
    expect(res.status).toBe(400);
  });
});
