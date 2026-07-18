import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    parametres: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { PARAMETRES_UPDATED: "PARAMETRES_UPDATED" },
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

const defaultParams = {
  id: "default",
  nomCommerce: "Ma Boutique",
  adresse: "123 Rue du Commerce",
  telephone: "+221 77 000 00 00",
  email: "contact@boutique.com",
  rccm: "SN-DKR-2024-B-12345",
  nif: "1234567890",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/parametres", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/parametres/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns existing parametres for any authenticated user", async () => {
    mockSession("CAISSIER");
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(defaultParams);

    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.nomCommerce).toBe("Ma Boutique");
  });

  it("returns empty defaults if no parametres exist", async () => {
    mockSession("ADMIN");
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.nomCommerce).toBe("");
  });
});

describe("PUT /api/parametres", () => {
  let PUT: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    PUT = (await import("@/app/api/parametres/route")).PUT;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomCommerce: "Test" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomCommerce: "Test" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for MANAGER", async () => {
    mockSession("MANAGER");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomCommerce: "Test" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data (empty nomCommerce)", async () => {
    mockSession("ADMIN");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomCommerce: "" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    mockSession("ADMIN");
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomCommerce: "Test", email: "not-an-email" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("upserts parametres for ADMIN and returns 200", async () => {
    mockSession("ADMIN");
    const input = {
      nomCommerce: "Super Marche",
      adresse: "456 Avenue",
      telephone: "+221 77 111 11 11",
      email: "info@super.com",
      rccm: "RCCM-123",
      nif: "NIF-456",
    };
    (prisma.parametres.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "default",
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.nomCommerce).toBe("Super Marche");
    expect(prisma.parametres.upsert).toHaveBeenCalledOnce();
  });
});
