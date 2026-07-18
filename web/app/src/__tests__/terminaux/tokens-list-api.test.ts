import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    terminalCaisse: { findUnique: vi.fn() },
    storeToken: { findMany: vi.fn() },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1", email: "t@t.com", name: "T", role } });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/terminaux/[id]/tokens", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import("@/app/api/terminaux/[id]/tokens/route"));
  });

  it("liste les jetons non révoqués, sans tokenHash", async () => {
    mockSession("ADMIN");
    (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1" });
    (prisma.storeToken.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "tok1", label: "poste-entrée", createdAt: new Date(), lastUsedAt: null },
    ]);
    const res = await GET(new Request("http://x"), ctx("t1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toEqual(expect.objectContaining({ id: "tok1", label: "poste-entrée" }));
    expect(JSON.stringify(body)).not.toContain("tokenHash");
    expect(prisma.storeToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { terminalId: "t1", revoked: false } }),
    );
  });

  it("404 si terminal introuvable", async () => {
    mockSession("ADMIN");
    (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), ctx("absent"));
    expect(res.status).toBe(404);
  });

  it("403 pour MANAGER", async () => {
    mockSession("MANAGER");
    const res = await GET(new Request("http://x"), ctx("t1"));
    expect(res.status).toBe(403);
  });
});
