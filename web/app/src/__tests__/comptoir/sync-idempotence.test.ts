/**
 * P1-009: Sync offline must be idempotent — no duplicates on replay.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { CASH_MOVEMENT_CREATED: "CASH_MOVEMENT_CREATED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { findFirst: vi.fn() },
    mouvementCaisse: { findFirst: vi.fn() },
  },
}));

import { requireAuth } from "@/lib/permissions";
import { prisma } from "@/lib/db";

function mockAuth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id: "u1", email: "t@t.com", name: "T", role: "CAISSIER" },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/comptoir/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("P1-009: Sync idempotence", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sync/route")).POST;
  });

  it("skips already-synced VENTE operations (idempotent)", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: { id: "v1" } }, { status: 201 }),
    );

    // Mock that the sale with this offlineId already exists
    (prisma.vente.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "v1" });

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-1", type: "VENTE", payload: { lignes: [] }, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // The operation should be marked as already processed, not re-executed
    expect(body.data.results[0].status).toBe("already_processed");
    // fetch should NOT have been called since it was skipped
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("skips already-synced MOUVEMENT_MANUEL operations (idempotent)", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: { id: "m1" } }, { status: 201 }),
    );

    // Mock: no vente match, but movement with reference exists
    (prisma.vente.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.mouvementCaisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "m1" });

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-2", type: "MOUVEMENT_MANUEL", payload: { type: "APPORT" }, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.results[0].status).toBe("already_processed");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("processes new operations normally when not yet synced", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: { id: "v1" } }, { status: 201 }),
    );

    // No existing sale with this offlineId
    (prisma.vente.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-new", type: "VENTE", payload: { lignes: [] }, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.results[0].status).toBe("ok");
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("sending same batch twice produces no duplicates", async () => {
    mockAuth();

    // First time: not yet synced, proceed
    (prisma.vente.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // first batch, op-1
      .mockResolvedValueOnce({ id: "v1" }); // second batch, op-1 already exists

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: { id: "v1" } }, { status: 201 }),
    );

    const batch = {
      operations: [
        { id: "op-1", type: "VENTE", payload: { lignes: [] }, createdAt: "2026-01-01T00:00:00Z" },
      ],
    };

    // First submission
    const res1 = await POST(jsonReq(batch));
    const body1 = await res1.json();
    expect(body1.data.results[0].status).toBe("ok");

    // Second submission (same batch)
    const res2 = await POST(jsonReq(batch));
    const body2 = await res2.json();
    expect(body2.data.results[0].status).toBe("already_processed");
    // fetch should have been called only once (first batch)
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });
});
