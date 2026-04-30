import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { USER_CREATED: "USER_CREATED", USER_UPDATED: "USER_UPDATED", USER_DEACTIVATED: "USER_DEACTIVATED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { hash } from "bcryptjs";

// ─── Helpers ─────────────────────────────────────────

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function mockNoSession() {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

const mockUser = {
  id: "usr-1",
  nom: "Alice Dupont",
  email: "alice@aerispay.com",
  motDePasse: "$2a$12$hash",
  role: "CAISSIER" as Role,
  actif: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ─── GET /api/users ──────────────────────────────────

describe("GET /api/users", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/users/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/users"));
    expect(res.status).toBe(401);
  });

  it("returns 403 if not ADMIN", async () => {
    mockSession("MANAGER");
    const res = await GET(new Request("http://localhost/api/users"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for CAISSIER", async () => {
    mockSession("CAISSIER");
    const res = await GET(new Request("http://localhost/api/users"));
    expect(res.status).toBe(403);
  });

  it("returns users list for ADMIN", async () => {
    mockSession("ADMIN");
    const users = [mockUser];
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(users);
    (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/users"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty("motDePasse");
    expect(body.data[0].email).toBe("alice@aerispay.com");
  });

  it("supports pagination", async () => {
    mockSession("ADMIN");
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const res = await GET(new Request("http://localhost/api/users?page=2&pageSize=10"));
    expect(res.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });
});

// ─── POST /api/users ─────────────────────────────────

describe("POST /api/users", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/users/route");
    POST = mod.POST;
  });

  const validBody = {
    nom: "Bob Martin",
    email: "bob@aerispay.com",
    motDePasse: "SecurePass123",
    role: "CAISSIER",
  };

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 if not ADMIN", async () => {
    mockSession("MANAGER");
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data", async () => {
    mockSession("ADMIN");
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({ nom: "A", email: "bad", motDePasse: "short", role: "FAKE" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 if email already exists", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({ ...validBody, email: mockUser.email }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("creates user with hashed password for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockUser,
      id: "usr-new",
      nom: validBody.nom,
      email: validBody.email,
    });

    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    expect(hash).toHaveBeenCalledWith(validBody.motDePasse, 12);
    const body = await res.json();
    expect(body.data).not.toHaveProperty("motDePasse");
  });
});

// ─── GET /api/users/[id] ─────────────────────────────

describe("GET /api/users/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/users/[id]/route");
    GET = mod.GET;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      new Request("http://localhost/api/users/usr-1"),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 if not ADMIN", async () => {
    mockSession("CAISSIER");
    const res = await GET(
      new Request("http://localhost/api/users/usr-1"),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if user not found", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/users/usr-999"),
      { params: Promise.resolve({ id: "usr-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns user without password for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    const res = await GET(
      new Request("http://localhost/api/users/usr-1"),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).not.toHaveProperty("motDePasse");
    expect(body.data.id).toBe("usr-1");
  });
});

// ─── PUT /api/users/[id] ─────────────────────────────

describe("PUT /api/users/[id]", () => {
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/users/[id]/route");
    PUT = mod.PUT;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoSession();
    const res = await PUT(
      new Request("http://localhost/api/users/usr-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 if not ADMIN", async () => {
    mockSession("MANAGER");
    const res = await PUT(
      new Request("http://localhost/api/users/usr-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if user not found", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(
      new Request("http://localhost/api/users/usr-999", {
        method: "PUT",
        body: JSON.stringify({ nom: "Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "usr-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates user fields for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockUser,
      nom: "Alice Updated",
    });

    const res = await PUT(
      new Request("http://localhost/api/users/usr-1", {
        method: "PUT",
        body: JSON.stringify({ nom: "Alice Updated" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nom).toBe("Alice Updated");
    expect(body.data).not.toHaveProperty("motDePasse");
  });

  it("hashes password when updating password", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    await PUT(
      new Request("http://localhost/api/users/usr-1", {
        method: "PUT",
        body: JSON.stringify({ motDePasse: "NewSecure123" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(hash).toHaveBeenCalledWith("NewSecure123", 12);
  });

  it("can deactivate a user (soft delete)", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockUser,
      actif: false,
    });

    const res = await PUT(
      new Request("http://localhost/api/users/usr-1", {
        method: "PUT",
        body: JSON.stringify({ actif: false }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.actif).toBe(false);
  });
});

// ─── Error paths (500) ──────────────────────────────

describe("Users error handling", () => {
  it("GET /api/users returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const { GET } = await import("@/app/api/users/route");
    const res = await GET(new Request("http://localhost/api/users"));
    expect(res.status).toBe(500);
  });

  it("POST /api/users returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.user.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const { POST } = await import("@/app/api/users/route");
    const res = await POST(new Request("http://localhost/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom: "Test User", email: "test@x.com", motDePasse: "Secure12345", role: "CAISSIER" }),
    }));
    expect(res.status).toBe(500);
  });

  it("GET /api/users/[id] returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const { GET } = await import("@/app/api/users/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/users/u-1"),
      { params: Promise.resolve({ id: "u-1" }) }
    );
    expect(res.status).toBe(500);
  });

  it("PUT /api/users/[id] returns 500 on DB error", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const { PUT } = await import("@/app/api/users/[id]/route");
    const res = await PUT(
      new Request("http://localhost/api/users/usr-1", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "Updated" }),
      }),
      { params: Promise.resolve({ id: "usr-1" }) }
    );
    expect(res.status).toBe(500);
  });
});
