import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    taxe: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    TAXE_UPDATED: "TAXE_UPDATED",
    TAXE_DELETED: "TAXE_DELETED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "Test", role },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PUT /api/taxes/[id]", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    PUT = (await import("@/app/api/taxes/[id]/route")).PUT;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "TVA modifiee" }),
      }),
      makeParams("taxe-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "TVA modifiee" }),
      }),
      makeParams("taxe-1")
    );
    expect(res.status).toBe(403);
  });

  it("updates a taxe for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.taxe.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "taxe-1",
      nom: "TVA modifiee",
      taux: 20,
      active: true,
      ordre: 0,
      parametresId: "default",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "TVA modifiee", taux: 20 }),
      }),
      makeParams("taxe-1")
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.nom).toBe("TVA modifiee");
  });
});

describe("DELETE /api/taxes/[id]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    DELETE = (await import("@/app/api/taxes/[id]/route")).DELETE;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost"), makeParams("taxe-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await DELETE(new Request("http://localhost"), makeParams("taxe-1"));
    expect(res.status).toBe(403);
  });

  it("deletes a taxe for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.taxe.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "taxe-1",
      nom: "TVA",
      taux: 18,
      active: true,
      ordre: 0,
      parametresId: "default",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await DELETE(new Request("http://localhost"), makeParams("taxe-1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toBeDefined();
  });
});
