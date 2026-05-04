import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { INTEGRITY_CHECK_PERFORMED: "INTEGRITY_CHECK_PERFORMED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/integrity", () => ({
  verifySessionIntegrity: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { verifySessionIntegrity } from "@/lib/services/integrity";

// ─── Helpers ─────────────────────────────────────────

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function mockNoAuth() {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

function makeReq(): Request {
  return new Request("http://localhost/api/comptoir/sessions/s-1/verify", { method: "POST" });
}

function makeParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: "s-1" }) };
}

// ─── Tests ───────────────────────────────────────────

describe("POST /api/comptoir/sessions/[id]/verify", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/verify/route")).POST;
  });

  it("returns 401 if not authenticated", async () => {
    mockNoAuth();
    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for CAISSIER (no permission comptoir:verifier_integrite)", async () => {
    mockUser("CAISSIER");
    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 200 for ADMIN", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1",
      statut: "VALIDEE",
    });
    (verifySessionIntegrity as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      storedHash: "abc123",
      computedHash: "abc123",
    });

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(true);
  });

  it("returns 200 for MANAGER", async () => {
    mockUser("MANAGER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1",
      statut: "FERMEE",
    });
    (verifySessionIntegrity as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false,
      storedHash: "abc123",
      computedHash: "def456",
    });

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.storedHash).toBe("abc123");
    expect(body.data.computedHash).toBe("def456");
  });

  it("returns valid=true when hash matches", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1",
      statut: "VALIDEE",
    });
    (verifySessionIntegrity as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      storedHash: "hash-ok",
      computedHash: "hash-ok",
    });

    const res = await POST(makeReq(), makeParams());
    const body = await res.json();
    expect(body.data.valid).toBe(true);
    expect(body.data.storedHash).toBe(body.data.computedHash);
  });

  it("returns valid=false when hash does not match", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1",
      statut: "VALIDEE",
    });
    (verifySessionIntegrity as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false,
      storedHash: "stored-hash",
      computedHash: "different-hash",
    });

    const res = await POST(makeReq(), makeParams());
    const body = await res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.storedHash).toBe("stored-hash");
    expect(body.data.computedHash).toBe("different-hash");
  });

  it("returns 404 if session not found", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 422 if session status is not verifiable (OUVERTE)", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1",
      statut: "OUVERTE",
    });

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(422);
  });

  it("returns 500 on unexpected error", async () => {
    mockUser("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB down"));

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(500);
  });
});
