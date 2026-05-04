import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
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
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 100000 }]),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// ─── Helpers ─────────────────────────────────────────

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function makePostReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/comptoir/sessions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = { montantOuvertureCash: 50000, montantOuvertureMobileMoney: 0 };

// ─── Tests ───────────────────────────────────────────

describe("POST /api/comptoir/sessions — race condition protection", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/route")).POST;
  });

  it("uses $transaction to atomically check+create session", async () => {
    mockUser("CAISSIER", "user-1");
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });

    const createdSession = {
      id: "new-session",
      montantOuvertureCash: 50000,
      montantOuvertureMobileMoney: 0,
      ouvertureAt: new Date(),
      userId: "user-1",
      user: { id: "user-1", nom: "Test", email: "test@aerispay.com" },
    };

    // Mock the $transaction to simulate the atomic check+create
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          comptoirSession: {
            findFirst: vi.fn().mockResolvedValue(null), // no existing session
            create: vi.fn().mockResolvedValue(createdSession),
          },
        };
        return fn(tx);
      },
    );

    const res = await POST(makePostReq(validBody));
    expect(res.status).toBe(201);

    // Verify $transaction was called (not bare findFirst+create)
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("returns 409 when concurrent request creates session first (within transaction)", async () => {
    mockUser("CAISSIER", "user-1");
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });

    // Mock the $transaction so that findFirst inside returns an existing session
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          comptoirSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "existing-session", statut: "OUVERTE" }),
            create: vi.fn(),
          },
        };
        return fn(tx);
      },
    );

    const res = await POST(makePostReq(validBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("session");
  });

  it("two sequential calls: second one gets 409 thanks to transaction check", async () => {
    mockUser("CAISSIER", "user-1");
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });

    const createdSession = {
      id: "new-session",
      montantOuvertureCash: 50000,
      montantOuvertureMobileMoney: 0,
      ouvertureAt: new Date(),
      userId: "user-1",
      user: { id: "user-1", nom: "Test", email: "test@aerispay.com" },
    };

    let callCount = 0;
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        callCount++;
        const isSecondCall = callCount > 1;
        const tx = {
          comptoirSession: {
            findFirst: vi.fn().mockResolvedValue(
              isSecondCall ? { id: "new-session", statut: "OUVERTE" } : null,
            ),
            create: vi.fn().mockResolvedValue(createdSession),
          },
        };
        return fn(tx);
      },
    );

    // First call succeeds
    const res1 = await POST(makePostReq(validBody));
    expect(res1.status).toBe(201);

    // Second call fails because session now exists (found by transaction findFirst)
    const res2 = await POST(makePostReq(validBody));
    expect(res2.status).toBe(409);
  });
});
