import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    caisse: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { COMPTOIR_SESSION_OPENED: "COMPTOIR_SESSION_OPENED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([
    { mode: "ESPECES", solde: 50000 },
  ]),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function postReq(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/comptoir/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ montantOuvertureCash: 50000, ...body }),
  });
}

const mockCreatedSession = {
  id: "session-1",
  ouvertureAt: new Date("2026-05-01T08:00:00Z"),
  fermetureAt: null,
  montantOuvertureCash: 50000,
  montantOuvertureMobileMoney: 0,
  statut: "OUVERTE",
  userId: "user-1",
  user: { id: "user-1", nom: "Test", email: "t@t.com" },
};

describe("POST /api/comptoir/sessions — all roles can open (P1-008)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/comptoir/sessions/route");
    POST = mod.POST;
    // $transaction passthrough: execute callback with the outer prisma mock
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    // No existing open session
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // Active caisse
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });
    // Session creation
    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedSession);
  });

  it("ADMIN can open a session (has comptoir:vendre)", async () => {
    mockSession("ADMIN");
    const res = await POST(postReq());
    expect(res.status).toBe(201);
  });

  it("MANAGER can open a session (has comptoir:vendre)", async () => {
    mockSession("MANAGER");
    const res = await POST(postReq());
    expect(res.status).toBe(201);
  });

  it("CAISSIER can open a session (has comptoir:vendre)", async () => {
    mockSession("CAISSIER");
    const res = await POST(postReq());
    expect(res.status).toBe(201);
  });

  it("unauthenticated user cannot open a session", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(postReq());
    expect(res.status).toBe(401);
  });
});
