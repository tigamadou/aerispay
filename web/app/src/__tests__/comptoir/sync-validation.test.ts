import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks ----

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
    vente: { findFirst: vi.fn().mockResolvedValue(null) },
    mouvementCaisse: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { requireAuth } from "@/lib/permissions";

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

// ---- Tests ----

describe("POST /api/comptoir/sync — payload validation (P2-008)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    POST = (await import("@/app/api/comptoir/sync/route")).POST;
  });

  it("rejette un type invalide (ni VENTE ni MOUVEMENT_MANUEL) → 400", async () => {
    mockAuth();
    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-1", type: "INVALID_TYPE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Données invalides");
  });

  it("rejette une operation sans id (offlineId vide) → 400", async () => {
    mockAuth();
    const res = await POST(
      jsonReq({
        operations: [
          { id: "", type: "VENTE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejette un payload non-objet (string) → 400", async () => {
    mockAuth();
    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-1", type: "VENTE", payload: "not-an-object", createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejette un payload non-objet (number) → 400", async () => {
    mockAuth();
    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-1", type: "VENTE", payload: 42, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepte un payload objet valide", async () => {
    mockAuth();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: { id: "v1" } }, { status: 201 }),
    );

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-1", type: "VENTE", payload: { lignes: [] }, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    fetchSpy.mockRestore();
  });
});
