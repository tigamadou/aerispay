/**
 * P0-004: Closure discrepancies must include opening fund in theoretical balance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

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
  computeSoldeTheoriqueParMode: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

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

describe("P0-004: Closure includes opening fund in theoretical balance", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: "s-1" }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/closure/route")).POST;
  });

  it("theoretical ESPECES balance includes montantOuvertureCash", async () => {
    mockUser("CAISSIER");

    const openSession = {
      id: "s-1",
      statut: "OUVERTE",
      userId: "user-1",
      montantOuvertureCash: 50000,
      montantOuvertureMobileMoney: 0,
    };

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);

    // Movements only contain 28000 ESPECES from sales (no opening fund movement)
    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 28000 },
    ]);

    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    // Declare exactly 78000 (50000 opening + 28000 from sales)
    const res = await POST(
      jsonReq({ declarations: { ESPECES: 78000 } }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // The theoretical balance should be 78000 (28000 movements + 50000 opening)
    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(78000);
    // Declared 78000, theoretical 78000 → ecart = 0
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(0);
  });

  it("also adds montantOuvertureMobileMoney to mobile money modes", async () => {
    mockUser("CAISSIER");

    const openSession = {
      id: "s-1",
      statut: "OUVERTE",
      userId: "user-1",
      montantOuvertureCash: 50000,
      montantOuvertureMobileMoney: 10000,
    };

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);

    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 28000 },
      { mode: "MOBILE_MONEY_MTN", solde: 5000 },
    ]);

    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    const res = await POST(
      jsonReq({ declarations: { ESPECES: 78000, MOBILE_MONEY_MTN: 15000 } }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // ESPECES: 28000 + 50000 opening = 78000
    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(78000);
    // MOBILE_MONEY_MTN: 5000 + 10000 opening mobile = 15000
    expect(body.data.ecartsParMode.MOBILE_MONEY_MTN.theorique).toBe(15000);
  });
});
