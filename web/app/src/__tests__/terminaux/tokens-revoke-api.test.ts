import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({ prisma: { storeToken: { findUnique: vi.fn() } } }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/services/store-token", () => ({ revokeStoreToken: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { STORE_TOKEN_REVOKED: "STORE_TOKEN_REVOKED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { revokeStoreToken } from "@/lib/services/store-token";
import { logActivity } from "@/lib/activity-log";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1", email: "t@t.com", name: "T", role } });
}
const ctx = (id: string, tokenId: string) => ({ params: Promise.resolve({ id, tokenId }) });

describe("DELETE /api/terminaux/[id]/tokens/[tokenId]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string; tokenId: string }> }) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ DELETE } = await import("@/app/api/terminaux/[id]/tokens/[tokenId]/route"));
  });

  it("révoque et journalise", async () => {
    mockSession("ADMIN");
    (prisma.storeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "tok1", terminalId: "t1", revoked: false });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1", "tok1"));
    expect(res.status).toBe(200);
    expect(revokeStoreToken).toHaveBeenCalledWith("tok1");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "STORE_TOKEN_REVOKED" }));
  });

  it("404 si le jeton n'appartient pas au terminal", async () => {
    mockSession("ADMIN");
    (prisma.storeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "tok1", terminalId: "AUTRE", revoked: false });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1", "tok1"));
    expect(res.status).toBe(404);
    expect(revokeStoreToken).not.toHaveBeenCalled();
  });

  it("403 pour MANAGER", async () => {
    mockSession("MANAGER");
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1", "tok1"));
    expect(res.status).toBe(403);
  });
});
