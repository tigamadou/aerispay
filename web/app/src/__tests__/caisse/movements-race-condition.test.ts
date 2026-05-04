/**
 * P1-003: Race condition on balance check + movement creation.
 * Balance check and movement must be in a transaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
    caisse: { findFirst: vi.fn(), findUnique: vi.fn() },
    mouvementCaisse: { create: vi.fn(), findMany: vi.fn() },
    seuilCaisse: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { CASH_MOVEMENT_CREATED: "CASH_MOVEMENT_CREATED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  createMovement: vi.fn().mockResolvedValue({
    id: "mv-1", type: "RETRAIT", mode: "ESPECES", montant: -1000,
    caisseId: "caisse-1", auteurId: "user-1", createdAt: new Date(),
  }),
  createMovementInTx: vi.fn().mockResolvedValue({
    id: "mv-1", type: "RETRAIT", mode: "ESPECES", montant: -1000,
    caisseId: "caisse-1", auteurId: "user-1", createdAt: new Date(),
  }),
  computeSoldeCaisseParMode: vi.fn(),
}));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) => {
    const d: Record<string, number> = {
      THRESHOLD_CASH_WITHDRAWAL_AUTH: 100000,
      THRESHOLD_EXPENSE_AUTH: 50000,
    };
    return d[id] ?? 0;
  }),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

describe("P1-003: Withdrawal atomicity (comptoir/movements)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/movements/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", userId: "user-1",
    });
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("withdrawal succeeds when balance is sufficient", async () => {
    mockSession("MANAGER");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 1000 },
    ]);

    const res = await POST(new Request("http://localhost/api/comptoir/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "s-1",
        type: "RETRAIT",
        mode: "ESPECES",
        montant: 1000,
        motif: "Retrait test",
      }),
    }));

    expect(res.status).toBe(201);
  });

  it("withdrawal rejected when balance is insufficient", async () => {
    mockSession("MANAGER");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 500 },
    ]);

    const res = await POST(new Request("http://localhost/api/comptoir/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "s-1",
        type: "RETRAIT",
        mode: "ESPECES",
        montant: 1000,
        motif: "Retrait test",
      }),
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/insuffisant/i);
  });
});

describe("P1-003: Withdrawal atomicity (caisse/[id]/mouvements)", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/caisse/[id]/mouvements/route")).POST;
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("withdrawal rejected when balance is 0", async () => {
    mockSession("MANAGER");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 0 },
    ]);

    const res = await POST(
      new Request("http://localhost/api/caisse/caisse-1/mouvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "RETRAIT",
          mode: "ESPECES",
          montant: 1000,
          motif: "Retrait test",
        }),
      }),
      { params: Promise.resolve({ id: "caisse-1" }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/insuffisant/i);
  });
});
