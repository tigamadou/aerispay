import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    caisse: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    mouvementCaisse: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeCaisseParMode: vi.fn(),
  createMovement: vi.fn().mockResolvedValue({
    id: "mv-1", type: "APPORT", mode: "ESPECES", montant: 5000,
    caisseId: "caisse-1", auteurId: "user-1", createdAt: new Date(),
  }),
}));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) => {
    const defaults: Record<string, number> = {
      THRESHOLD_CASH_WITHDRAWAL_AUTH: 10000,
      THRESHOLD_EXPENSE_AUTH: 5000,
    };
    return defaults[id] ?? 0;
  }),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { CASH_MOVEMENT_CREATED: "CASH_MOVEMENT_CREATED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeCaisseParMode, createMovement } from "@/lib/services/cash-movement";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

const fakeCaisse = { id: "caisse-1", nom: "Caisse principale", active: true };

const fakeSoldes = [
  { mode: "ESPECES", solde: 45000 },
  { mode: "MOBILE_MONEY_MTN", solde: 12000 },
];

// ─── GET /api/caisse (liste des caisses) ────────────

describe("GET /api/caisse", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/caisse/route")).GET;
    (prisma.caisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fakeCaisse]);
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/caisse"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await GET(new Request("http://localhost/api/caisse"));
    expect(res.status).toBe(403);
  });

  it("ADMIN returns list of caisses", async () => {
    mockSession("ADMIN");
    const res = await GET(new Request("http://localhost/api/caisse"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].nom).toBe("Caisse principale");
  });
});

// ─── GET /api/caisse/[id]/soldes ────────────────────

describe("GET /api/caisse/[id]/soldes", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/caisse/[id]/soldes/route")).GET;
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSoldes);
  });

  const params = Promise.resolve({ id: "caisse-1" });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/caisse/caisse-1/soldes"), { params });
    expect(res.status).toBe(401);
  });

  it("returns soldes for caisse", async () => {
    mockSession("ADMIN");
    const res = await GET(new Request("http://localhost/api/caisse/caisse-1/soldes"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldes).toEqual(fakeSoldes);
    expect(body.data.total).toBe(57000);
    expect(body.data.caisse.nom).toBe("Caisse principale");
  });

  it("returns 404 if caisse not found", async () => {
    mockSession("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/caisse/unknown/soldes"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await GET(new Request("http://localhost/api/caisse/caisse-1/soldes"), { params });
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/caisse/[id]/mouvements ────────────────

describe("GET /api/caisse/[id]/mouvements", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const fakeMouvements = [
    { id: "mv-1", type: "VENTE", mode: "ESPECES", montant: 5000, createdAt: new Date(), auteur: { id: "u-1", nom: "Alice" }, vente: null },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/caisse/[id]/mouvements/route")).GET;
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMouvements);
    (prisma.mouvementCaisse.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
  });

  const params = Promise.resolve({ id: "caisse-1" });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/caisse/caisse-1/mouvements"), { params });
    expect(res.status).toBe(401);
  });

  it("returns movements for caisse with pagination", async () => {
    mockSession("MANAGER");
    const res = await GET(new Request("http://localhost/api/caisse/caisse-1/mouvements"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("returns 404 if caisse not found", async () => {
    mockSession("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/caisse/unknown/mouvements"), { params });
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/caisse/[id]/mouvements ───────────────

describe("POST /api/caisse/[id]/mouvements", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/caisse/[id]/mouvements/route")).POST;
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCaisse);
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSoldes);
    (createMovement as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "mv-1", type: "APPORT", mode: "ESPECES", montant: 5000,
      caisseId: "caisse-1", auteurId: "user-1", createdAt: new Date(),
    });
  });

  const params = Promise.resolve({ id: "caisse-1" });

  function jsonReq(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/caisse/caisse-1/mouvements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const validApport = { type: "APPORT", mode: "ESPECES", montant: 5000, motif: "Apport de monnaie" };

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(jsonReq(validApport), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq(validApport), { params });
    expect(res.status).toBe(403);
  });

  it("MANAGER creates APPORT on caisse", async () => {
    mockSession("MANAGER");
    const res = await POST(jsonReq(validApport), { params });
    expect(res.status).toBe(201);
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "APPORT", caisseId: "caisse-1", montant: 5000 }),
    );
  });

  it("creates RETRAIT with negative sign", async () => {
    mockSession("MANAGER");
    const res = await POST(jsonReq({ ...validApport, type: "RETRAIT", montant: 3000, motif: "Retrait courant" }), { params });
    expect(res.status).toBe(201);
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RETRAIT", montant: -3000 }),
    );
  });

  it("ADMIN RETRAIT above threshold succeeds", async () => {
    mockSession("ADMIN");
    const res = await POST(jsonReq({ ...validApport, type: "RETRAIT", montant: 15000, motif: "Gros retrait" }), { params });
    expect(res.status).toBe(201);
  });

  it("RETRAIT exceeding cash balance returns 422", async () => {
    mockSession("MANAGER");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 2000 },
    ]);
    const res = await POST(jsonReq({ ...validApport, type: "RETRAIT", montant: 5000, motif: "Retrait trop important" }), { params });
    expect(res.status).toBe(422);
  });

  it("returns 404 if caisse not found", async () => {
    mockSession("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(jsonReq(validApport), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    mockSession("ADMIN");
    const res = await POST(jsonReq({ montant: 5000 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 for VENTE type (not allowed manually)", async () => {
    mockSession("ADMIN");
    const res = await POST(jsonReq({ ...validApport, type: "VENTE" }), { params });
    expect(res.status).toBe(400);
  });
});
