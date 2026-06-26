/**
 * F1.1 — CRUD admin caisses :
 * POST /api/caisse — création (ADMIN only)
 * PUT /api/caisse/[id] — mise à jour (ADMIN only)
 * DELETE /api/caisse/[id] — soft-delete (ADMIN only, refusé si session OUVERTE)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    caisse: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    comptoirSession: { findFirst: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    CAISSE_CREATED: "CAISSE_CREATED",
    CAISSE_UPDATED: "CAISSE_UPDATED",
    CAISSE_DEACTIVATED: "CAISSE_DEACTIVATED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockUser(role: Role, id = "admin-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "admin@t.com", name: "Admin", role },
  });
}

const fakeCaisse = { id: "caisse-1", nom: "Caisse principale", active: true, createdAt: new Date() };

describe("POST /api/caisse — création", () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/caisse/route")).POST;
  });

  const req = (b: unknown) =>
    new Request("http://localhost/api/caisse", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    });

  it("ADMIN crée une caisse → 201", async () => {
    mockUser("ADMIN");
    (prisma.caisse.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    const res = await POST(req({ nom: "Caisse principale" }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.nom).toBe("Caisse principale");
  });

  it("CAISSIER → 403", async () => {
    mockUser("CAISSIER");
    const res = await POST(req({ nom: "Test" }));
    expect(res.status).toBe(403);
  });

  it("MANAGER → 403", async () => {
    mockUser("MANAGER");
    const res = await POST(req({ nom: "Test" }));
    expect(res.status).toBe(403);
  });

  it("nom vide → 400", async () => {
    mockUser("ADMIN");
    const res = await POST(req({ nom: "" }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/caisse/[id] — mise à jour", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    PUT = (await import("@/app/api/caisse/[id]/route")).PUT;
  });

  const req = (b: unknown) =>
    new Request("http://localhost/api/caisse/caisse-1", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    });
  const ctx = { params: Promise.resolve({ id: "caisse-1" }) };

  it("ADMIN renomme → 200", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    (prisma.caisse.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...fakeCaisse, nom: "Nouveau" });
    const res = await PUT(req({ nom: "Nouveau" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.nom).toBe("Nouveau");
  });

  it("introuvable → 404", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(req({ nom: "X" }), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(404);
  });

  it("CAISSIER → 403", async () => {
    mockUser("CAISSIER");
    const res = await PUT(req({ nom: "X" }), ctx);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/caisse/[id] — soft-delete", () => {
  let DELETE_fn: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    DELETE_fn = (await import("@/app/api/caisse/[id]/route")).DELETE;
  });

  const req = () => new Request("http://localhost/api/caisse/caisse-1", { method: "DELETE" });
  const ctx = { params: Promise.resolve({ id: "caisse-1" }) };

  it("ADMIN désactive sans session ouverte → 200", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...fakeCaisse, active: false });
    const res = await DELETE_fn(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.active).toBe(false);
  });

  it("refus si session OUVERTE → 409", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-1", statut: "OUVERTE" });
    const res = await DELETE_fn(req(), ctx);
    expect(res.status).toBe(409);
  });

  it("introuvable → 404", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE_fn(req(), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(404);
  });

  it("CAISSIER → 403", async () => {
    mockUser("CAISSIER");
    const res = await DELETE_fn(req(), ctx);
    expect(res.status).toBe(403);
  });
});
