/**
 * P1-002: Hash integrity must be computed inside the transaction.
 * P0-005 (bis): caisseId validation in correct route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: {
      findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(),
      create: vi.fn(), findFirst: vi.fn(),
    },
    mouvementCaisse: { findMany: vi.fn(), create: vi.fn() },
    caisse: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SESSION_CORRECTED: "SESSION_CORRECTED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/integrity", () => ({
  computeHashForSession: vi.fn().mockResolvedValue("abc123hash"),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  compare: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeHashForSession } from "@/lib/services/integrity";

function mockUser(role: Role, id = "admin-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "a@t.com", name: "Admin", role },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "s-1" }) };

const validBody = {
  motDePasse: "admin123",
  motif: "Correction test",
  mouvements: [{ mode: "ESPECES", montant: 500, motif: "Ajustement" }],
};

describe("P1-002: Hash integrity inside transaction", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/correct/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ motDePasse: "hashed" });
  });

  it("corrective session always has hashIntegrite non-null", async () => {
    mockUser("ADMIN");

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE", userId: "user-1", sessionCorrective: null,
    });

    let transactionUpdateCalled = false;
    const correctiveSession = {
      id: "s-corrective", statut: "VALIDEE", fermetureAt: new Date(),
      montantOuvertureCash: 0, montantOuvertureMobileMoney: 0,
      userId: "admin-1", sessionCorrigeeId: "s-1",
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          create: vi.fn().mockResolvedValue(correctiveSession),
          update: vi.fn().mockImplementation(async () => {
            transactionUpdateCalled = true;
          }),
        },
      };
      return fn(tx);
    });

    const res = await POST(jsonReq(validBody), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();

    // Hash should be set
    expect(body.data.hash).toBeTruthy();
    // computeHashForSession should have been called
    expect(computeHashForSession).toHaveBeenCalled();
    // The hash update should happen inside the transaction
    expect(transactionUpdateCalled).toBe(true);
  });
});

describe("P0-005 (bis): caisseId validation in correct route", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/correct/route")).POST;
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ motDePasse: "hashed" });
  });

  it("returns 422 when no active caisse exists", async () => {
    mockUser("ADMIN");

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "VALIDEE", userId: "user-1", sessionCorrective: null,
    });
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(jsonReq(validBody), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/caisse/i);
  });
});
