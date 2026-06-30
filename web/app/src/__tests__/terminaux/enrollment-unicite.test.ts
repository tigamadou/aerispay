import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    terminalCaisse: { findUnique: vi.fn() },
    storeToken: { findFirst: vi.fn() },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/services/enrollment-token", () => ({
  issueEnrollmentToken: vi.fn().mockResolvedValue({ token: "CODE-123", id: "enr1", expiresAt: new Date() }),
  consumeEnrollmentToken: vi.fn(),
}));
vi.mock("@/lib/services/store-token", () => ({
  issueStoreToken: vi.fn().mockResolvedValue({ token: "store-token", id: "st1" }),
}));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { POSTE_ENROLLED: "POSTE_ENROLLED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { issueEnrollmentToken, consumeEnrollmentToken } from "@/lib/services/enrollment-token";
import { issueStoreToken } from "@/lib/services/store-token";

function mockAdmin() {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1", email: "a@a.com", name: "A", role: "ADMIN" as Role } });
}
const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/enrollment — règle 1:1", () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAdmin();
    (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1", active: true, code: "P1" });
    ({ POST } = await import("@/app/api/enrollment/route"));
  });

  it("409 si un jeton actif existe déjà", async () => {
    (prisma.storeToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-existant" });
    const res = await POST(post("http://x/api/enrollment", { terminalId: "t1" }));
    expect(res.status).toBe(409);
    expect(issueEnrollmentToken).not.toHaveBeenCalled();
  });

  it("201 si aucun jeton actif", async () => {
    (prisma.storeToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(post("http://x/api/enrollment", { terminalId: "t1" }));
    expect(res.status).toBe(201);
    expect(issueEnrollmentToken).toHaveBeenCalled();
  });
});

describe("POST /api/enrollment/exchange — garde 1:1", () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    (consumeEnrollmentToken as ReturnType<typeof vi.fn>).mockResolvedValue({ valid: true, terminalId: "t1", tokenId: "enr1" });
    (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1", active: true, code: "P1", nom: "Terminal 1" });
    ({ POST } = await import("@/app/api/enrollment/exchange/route"));
  });

  it("409 si le terminal a déjà un jeton actif", async () => {
    (prisma.storeToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-existant" });
    const res = await POST(post("http://x/api/enrollment/exchange", { token: "CODE-123" }));
    expect(res.status).toBe(409);
    expect(issueStoreToken).not.toHaveBeenCalled();
  });

  it("200 si aucun jeton actif", async () => {
    (prisma.storeToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(post("http://x/api/enrollment/exchange", { token: "CODE-123" }));
    expect(res.status).toBe(200);
    expect(issueStoreToken).toHaveBeenCalled();
  });
});
