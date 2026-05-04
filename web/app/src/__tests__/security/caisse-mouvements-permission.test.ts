import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    caisse: { findUnique: vi.fn() },
    mouvementCaisse: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    seuilCaisse: { findMany: vi.fn() },
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
    id: "mv-1", type: "APPORT", mode: "ESPECES", montant: 5000,
    caisseId: "caisse-1", auteurId: "user-1", createdAt: new Date(),
  }),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([
    { mode: "ESPECES", solde: 50000 },
  ]),
}));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockResolvedValue(10000),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function postReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/caisse/caisse-1/mouvements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(): Request {
  return new Request("http://localhost/api/caisse/caisse-1/mouvements", {
    method: "GET",
  });
}

const validBody = {
  type: "APPORT",
  mode: "ESPECES",
  montant: 5000,
  motif: "Apport de monnaie",
};

const params = Promise.resolve({ id: "caisse-1" });

describe("POST /api/caisse/[id]/mouvements — permission fix (P1-007)", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/caisse/[id]/mouvements/route");
    POST = mod.POST;
    GET = mod.GET;
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("CAISSIER can POST a movement (has comptoir:mouvement_manuel)", async () => {
    mockSession("CAISSIER");
    const res = await POST(postReq(validBody), { params });
    expect(res.status).toBe(201);
  });

  it("ADMIN can POST a movement (has comptoir:mouvement_manuel)", async () => {
    mockSession("ADMIN");
    const res = await POST(postReq(validBody), { params });
    expect(res.status).toBe(201);
  });

  it("MANAGER can POST a movement (has comptoir:mouvement_manuel)", async () => {
    mockSession("MANAGER");
    const res = await POST(postReq(validBody), { params });
    expect(res.status).toBe(201);
  });

  it("CAISSIER cannot GET movements (no rapports:consulter)", async () => {
    mockSession("CAISSIER");
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(403);
  });

  it("ADMIN can GET movements (has rapports:consulter)", async () => {
    mockSession("ADMIN");
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.mouvementCaisse.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
  });

  it("MANAGER can GET movements (has rapports:consulter)", async () => {
    mockSession("MANAGER");
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.mouvementCaisse.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
  });
});
