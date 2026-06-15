/**
 * Closure theoretical balance comes from grand livre (computeSoldeCaisseParMode),
 * not from montantOuvertureCash + session movements.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
    caisse: { findFirst: vi.fn() },
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
  computeSoldeCaisseParMode: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

function mockUser(role: Role, id = "user-1") {
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

describe("Closure theoretical balance from grand livre", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: "s-1" }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/closure/route")).POST;
  });

  it("theoretical balance comes from grand livre, not fond ouverture + movements", async () => {
    mockUser("CAISSIER");

    const openSession = {
      id: "s-1",
      statut: "OUVERTE",
      userId: "user-1",
      montantOuvertureCash: 100000,  // Cashier over-declared at opening
      montantOuvertureMobileMoney: 0,
    };

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    // Grand livre says 130000 total for ESPECES (real balance: 80000 opening + 50000 sales)
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 130000 },
    ]);

    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    // Cashier declares 130000 — the correct physical amount
    const res = await POST(jsonReq({ declarations: { ESPECES: 130000 } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Theoretical = 130000 from grand livre (NOT 100000 + movements)
    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(130000);
    // Declared 130000, theoretical 130000 -> ecart = 0
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(0);
  });

  it("detects real deficit when grand livre shows more than declared", async () => {
    mockUser("CAISSIER");

    const openSession = {
      id: "s-1",
      statut: "OUVERTE",
      userId: "user-1",
      montantOuvertureCash: 50000,
      montantOuvertureMobileMoney: 0,
    };

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    // Grand livre: 128000
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 128000 },
    ]);

    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    // Cashier declares 125000 — 3000 short
    const res = await POST(jsonReq({ declarations: { ESPECES: 125000 } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(128000);
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(-3000);
  });
});
