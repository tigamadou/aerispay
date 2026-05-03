import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    modePaiementConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    MODE_PAIEMENT_CREATED: "MODE_PAIEMENT_CREATED",
    MODE_PAIEMENT_UPDATED: "MODE_PAIEMENT_UPDATED",
    MODE_PAIEMENT_DELETED: "MODE_PAIEMENT_DELETED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "Test", role },
  });
}

const fakeModes = [
  { id: "m1", code: "ESPECES", label: "Cash", active: true, ordre: 0, parametresId: "default", createdAt: new Date(), updatedAt: new Date() },
  { id: "m2", code: "MOBILE_MONEY_MTN", label: "MomoPay", active: true, ordre: 1, parametresId: "default", createdAt: new Date(), updatedAt: new Date() },
  { id: "m3", code: "MOBILE_MONEY_MOOV", label: "MoovMoney", active: true, ordre: 2, parametresId: "default", createdAt: new Date(), updatedAt: new Date() },
  { id: "m4", code: "CELTIS_CASH", label: "Celtis Cash", active: true, ordre: 3, parametresId: "default", createdAt: new Date(), updatedAt: new Date() },
];

// ─── GET /api/parametres/modes-paiement ─────────────

describe("GET /api/parametres/modes-paiement", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/parametres/modes-paiement/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns all active modes for any authenticated user", async () => {
    mockSession("CAISSIER");
    (prisma.modePaiementConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeModes);

    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(4);
    expect(body.data[0].code).toBe("ESPECES");
    expect(body.data[0].label).toBe("Cash");
  });

  it("returns all modes (including inactive) when ?all=true for ADMIN", async () => {
    mockSession("ADMIN");
    const allModes = [...fakeModes, { ...fakeModes[0], id: "m5", code: "OLD_MODE", label: "Ancien", active: false, ordre: 99 }];
    (prisma.modePaiementConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(allModes);

    const res = await GET(new Request("http://localhost?all=true"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(5);
  });
});

// ─── POST /api/parametres/modes-paiement ────────────

describe("POST /api/parametres/modes-paiement", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/parametres/modes-paiement/route")).POST;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST", label: "Test" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST", label: "Test" }),
    }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for MANAGER", async () => {
    mockSession("MANAGER");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST", label: "Test" }),
    }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing code", async () => {
    mockSession("ADMIN");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Test" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing label", async () => {
    mockSession("ADMIN");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for code with spaces or lowercase", async () => {
    mockSession("ADMIN");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "test mode", label: "Test" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 409 if code already exists", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeModes[0]);

    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ESPECES", label: "Doublon" }),
    }));
    expect(res.status).toBe(409);
  });

  it("creates a new mode for ADMIN and returns 201", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const newMode = { id: "m5", code: "WAVE", label: "Wave", active: true, ordre: 4, parametresId: "default", createdAt: new Date(), updatedAt: new Date() };
    (prisma.modePaiementConfig.create as ReturnType<typeof vi.fn>).mockResolvedValue(newMode);

    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "WAVE", label: "Wave", ordre: 4 }),
    }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data.code).toBe("WAVE");
    expect(body.data.label).toBe("Wave");
    expect(prisma.modePaiementConfig.create).toHaveBeenCalledOnce();
  });
});

// ─── PUT /api/parametres/modes-paiement/[code] ──────

describe("PUT /api/parametres/modes-paiement/[code]", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ code: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    PUT = (await import("@/app/api/parametres/modes-paiement/[code]/route")).PUT;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "Nouveau" }) }),
      { params: Promise.resolve({ code: "ESPECES" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-ADMIN", async () => {
    mockSession("CAISSIER");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "Nouveau" }) }),
      { params: Promise.resolve({ code: "ESPECES" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if mode not found", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "Nouveau" }) }),
      { params: Promise.resolve({ code: "INCONNU" }) },
    );
    expect(res.status).toBe(404);
  });

  it("updates label and returns 200", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeModes[0]);
    const updated = { ...fakeModes[0], label: "Especes" };
    (prisma.modePaiementConfig.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "Especes" }) }),
      { params: Promise.resolve({ code: "ESPECES" }) },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.label).toBe("Especes");
  });

  it("can toggle active status", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeModes[0]);
    const updated = { ...fakeModes[0], active: false };
    (prisma.modePaiementConfig.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }),
      { params: Promise.resolve({ code: "ESPECES" }) },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.active).toBe(false);
  });
});

// ─── DELETE /api/parametres/modes-paiement/[code] ───

describe("DELETE /api/parametres/modes-paiement/[code]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ code: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    DELETE = (await import("@/app/api/parametres/modes-paiement/[code]/route")).DELETE;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ code: "ESPECES" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-ADMIN", async () => {
    mockSession("MANAGER");
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ code: "ESPECES" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if mode not found", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ code: "INCONNU" }) },
    );
    expect(res.status).toBe(404);
  });

  it("deletes mode and returns 200", async () => {
    mockSession("ADMIN");
    (prisma.modePaiementConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fakeModes[3]);
    (prisma.modePaiementConfig.delete as ReturnType<typeof vi.fn>).mockResolvedValue(fakeModes[3]);

    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ code: "CELTIS_CASH" }) },
    );
    expect(res.status).toBe(200);
    expect(prisma.modePaiementConfig.delete).toHaveBeenCalledOnce();
  });
});
