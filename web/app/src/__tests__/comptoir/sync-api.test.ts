import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

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
import { logActivity } from "@/lib/activity-log";

// ─── Helpers ────────────────────────────────────────

function mockAuth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id: "u1", email: "t@t.com", name: "T", role: "CAISSIER" },
  });
}

function mockUnauth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: false,
    response: Response.json({ error: "Non authentifié" }, { status: 401 }),
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/comptoir/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────

describe("POST /api/comptoir/sync", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sync/route")).POST;
  });

  it("renvoie 401 sans authentification", async () => {
    mockUnauth();
    const res = await POST(jsonReq({ operations: [] }));
    expect(res.status).toBe(401);
  });

  it("renvoie 400 pour un body invalide (operations manquant)", async () => {
    mockAuth();
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Données invalides");
  });

  it("renvoie 400 pour un tableau d'opérations vide", async () => {
    mockAuth();
    const res = await POST(jsonReq({ operations: [] }));
    expect(res.status).toBe(400);
  });

  it("traite une opération VENTE avec succès", async () => {
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
    const body = await res.json();
    expect(body.data.summary.succeeded).toBe(1);
    expect(body.data.results[0].status).toBe("ok");
    fetchSpy.mockRestore();
  });

  it("traite une opération MOUVEMENT_MANUEL avec succès", async () => {
    mockAuth();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: { id: "m1" } }, { status: 201 }),
    );

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-2", type: "MOUVEMENT_MANUEL", payload: { type: "APPORT" }, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.succeeded).toBe(1);
    fetchSpy.mockRestore();
  });

  it("détecte un conflit (422) d'une opération interne", async () => {
    mockAuth();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: "Stock insuffisant" }, { status: 422 }),
    );

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-3", type: "VENTE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    const body = await res.json();
    expect(body.data.summary.conflicts).toBe(1);
    expect(body.data.results[0].status).toBe("conflict");
    fetchSpy.mockRestore();
  });

  it("gère les erreurs d'opérations internes", async () => {
    mockAuth();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: "Erreur" }, { status: 500 }),
    );

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-4", type: "VENTE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    const body = await res.json();
    expect(body.data.summary.errors).toBe(1);
    expect(body.data.results[0].status).toBe("error");
    fetchSpy.mockRestore();
  });

  it("gère les exceptions dans le traitement d'opérations", async () => {
    mockAuth();
    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-5", type: "VENTE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    const body = await res.json();
    expect(body.data.summary.errors).toBe(1);
    expect(body.data.results[0].error).toBe("Network error");
    fetchSpy.mockRestore();
  });

  it("log l'activité après la synchronisation", async () => {
    mockAuth();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ data: {} }, { status: 201 }),
    );

    await POST(
      jsonReq({
        operations: [
          { id: "op-6", type: "VENTE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        entityType: "Sync",
        metadata: expect.objectContaining({ totalOperations: 1 }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it("renvoie le résumé correct pour plusieurs opérations", async () => {
    mockAuth();
    let callCount = 0;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return Response.json({ data: {} }, { status: 201 });
      return Response.json({ error: "Conflit" }, { status: 422 });
    });

    const res = await POST(
      jsonReq({
        operations: [
          { id: "op-a", type: "VENTE", payload: {}, createdAt: "2026-01-01T00:00:00Z" },
          { id: "op-b", type: "MOUVEMENT_MANUEL", payload: {}, createdAt: "2026-01-01T00:00:01Z" },
        ],
      }),
    );

    const body = await res.json();
    expect(body.data.summary.total).toBe(2);
    expect(body.data.summary.succeeded).toBe(1);
    expect(body.data.summary.conflicts).toBe(1);
    fetchSpy.mockRestore();
  });
});
