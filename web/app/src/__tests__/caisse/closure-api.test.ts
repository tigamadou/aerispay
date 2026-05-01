import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SESSION_CLOSURE_REQUESTED: "SESSION_CLOSURE_REQUESTED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([
    { mode: "ESPECES", solde: 78000 },
    { mode: "MOBILE_MONEY_MTN", solde: 12000 },
  ]),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function jsonReq(url: string, method: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const openSession = {
  id: "s-1", statut: "OUVERTE", userId: "user-1", declarationsValideur: null,
};
const pendingSession = {
  id: "s-1", statut: "EN_ATTENTE_VALIDATION", userId: "user-1", declarationsValideur: null,
};

// ─── POST /api/comptoir/sessions/[id]/closure ───────

describe("POST /api/comptoir/sessions/[id]/closure", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/closure/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession, ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );
    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 78000 },
      { mode: "MOBILE_MONEY_MTN", solde: 12000 },
    ]);
  });

  const ctx = { params: Promise.resolve({ id: "s-1" }) };

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: { ESPECES: 78000 } }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if session not found", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: { ESPECES: 78000 } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 if session is not OUVERTE", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...openSession, statut: "FERMEE",
    });
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: { ESPECES: 78000 } }),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 if CAISSIER tries to close another's session", async () => {
    mockUser("CAISSIER", "user-2");
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: { ESPECES: 78000 } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("CAISSIER submits declarations and session moves to EN_ATTENTE_VALIDATION", async () => {
    mockUser("CAISSIER");
    const res = await POST(
      jsonReq("http://localhost", "POST", {
        declarations: { ESPECES: 77000, MOBILE_MONEY_MTN: 12000 },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("EN_ATTENTE_VALIDATION");
    expect(body.data.ecartsParMode).toBeDefined();
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(-1000);
    expect(body.data.ecartsParMode.MOBILE_MONEY_MTN.ecart).toBe(0);
    expect(body.data.soldesParMode).toBeDefined();
  });

  it("MANAGER can request closure for session they own", async () => {
    mockUser("MANAGER", "user-1");
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: { ESPECES: 78000 } }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for empty declarations", async () => {
    mockUser("CAISSIER");
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: {} }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB error", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await POST(
      jsonReq("http://localhost", "POST", { declarations: { ESPECES: 78000 } }),
      ctx,
    );
    expect(res.status).toBe(500);
  });
});

// ─── DELETE /api/comptoir/sessions/[id]/closure ─────

describe("DELETE /api/comptoir/sessions/[id]/closure", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    DELETE = (await import("@/app/api/comptoir/sessions/[id]/closure/route")).DELETE;
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession, ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );
  });

  const ctx = { params: Promise.resolve({ id: "s-1" }) };

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(401);
  });

  it("cancels closure and returns to OUVERTE", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pendingSession);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.statut).toBe("OUVERTE");
    expect(body.data.declarationsCaissier).toBeNull();
  });

  it("returns 422 if session is OUVERTE (not pending)", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns 422 if blind validation already submitted", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingSession,
      declarationsValideur: { ESPECES: 78000 },
    });
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns 403 if CAISSIER tries to cancel another's closure", async () => {
    mockUser("CAISSIER", "user-2");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pendingSession);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });

  it("ADMIN can cancel any session's closure", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pendingSession);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
  });

  it("returns 404 if session not found", async () => {
    mockUser("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });
});
