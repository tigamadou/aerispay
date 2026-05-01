import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeTheoriqueParMode: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function getReq(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/comptoir/soldes");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

const openSession = {
  id: "s-1",
  statut: "OUVERTE",
  userId: "user-1",
  ouvertureAt: new Date("2026-05-01T08:00:00Z"),
  user: { id: "user-1", nom: "Alice" },
};

const fakeSoldes = [
  { mode: "ESPECES", solde: 45000 },
  { mode: "MOBILE_MONEY_MTN", solde: 12000 },
];

describe("GET /api/comptoir/soldes", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/soldes/route")).GET;
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSoldes);
  });

  // ─── Auth ─────────────────────────────────────────

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  // ─── CAISSIER auto-resolves own open session ──────

  it("CAISSIER gets soldes for own open session", async () => {
    mockSession("CAISSIER", "user-1");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldes).toEqual(fakeSoldes);
    expect(body.data.session.id).toBe("s-1");
    expect(prisma.comptoirSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", statut: "OUVERTE" },
      }),
    );
  });

  it("CAISSIER gets 404 if no open session", async () => {
    mockSession("CAISSIER", "user-1");
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(404);
  });

  // ─── MANAGER/ADMIN can query by sessionId ─────────

  it("MANAGER gets soldes for specific session", async () => {
    mockSession("MANAGER");
    const res = await GET(getReq({ sessionId: "s-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soldes).toEqual(fakeSoldes);
    expect(prisma.comptoirSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-1" } }),
    );
  });

  it("ADMIN gets soldes for own open session when no sessionId", async () => {
    mockSession("ADMIN", "user-1");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(prisma.comptoirSession.findFirst).toHaveBeenCalled();
  });

  it("returns 404 if specified session not found", async () => {
    mockSession("ADMIN");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(getReq({ sessionId: "unknown" }));
    expect(res.status).toBe(404);
  });

  // ─── Soldes total ─────────────────────────────────

  it("returns total across all modes", async () => {
    mockSession("CAISSIER", "user-1");
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.total).toBe(57000); // 45000 + 12000
  });

  // ─── Error handling ────────��──────────────────────

  it("returns 500 on unexpected error", async () => {
    mockSession("CAISSIER", "user-1");
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });
});
