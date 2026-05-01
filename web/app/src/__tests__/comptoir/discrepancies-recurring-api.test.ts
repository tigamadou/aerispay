import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/permissions", () => ({
  requireAuth: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn(),
}));

import { requireAuth, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSeuil } from "@/lib/services/seuils";

// ─── Helpers ────────────────────────────────────────

function mockAuth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: true,
    user: { id: "u1", email: "t@t.com", name: "T", role: "ADMIN" },
  });
}

function mockUnauth() {
  (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
    authenticated: false,
    response: Response.json({ error: "Non authentifié" }, { status: 401 }),
  });
}

function getReq(): Request {
  return new Request("http://localhost/api/comptoir/discrepancies/recurring");
}

// ─── Tests ──────────────────────────────────────────

describe("GET /api/comptoir/discrepancies/recurring", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/discrepancies/recurring/route")).GET;
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (getSeuil as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === "THRESHOLD_RECURRING_COUNT") return 3;
      if (id === "THRESHOLD_RECURRING_PERIOD_DAYS") return 7;
      return 0;
    });
  });

  it("renvoie 401 sans authentification", async () => {
    mockUnauth();
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("renvoie 403 sans permission rapports:consulter", async () => {
    mockAuth();
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("renvoie une liste vide sans écarts récurrents", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.caissiers).toHaveLength(0);
  });

  it("renvoie un caissier avec écarts récurrents au-dessus du seuil", async () => {
    mockAuth();
    const sessions = Array.from({ length: 3 }, (_, i) => ({
      id: `s-${i}`,
      userId: "u2",
      fermetureAt: new Date(),
      ecartsParMode: { ESPECES: { ecart: 500 } },
      user: { id: "u2", nom: "Caissier2", email: "c2@t.com" },
    }));
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.caissiers).toHaveLength(1);
    expect(body.data.caissiers[0].user.id).toBe("u2");
    expect(body.data.caissiers[0].count).toBe(3);
  });

  it("exclut les caissiers en dessous du seuil", async () => {
    mockAuth();
    const sessions = [
      {
        id: "s-1",
        userId: "u2",
        fermetureAt: new Date(),
        ecartsParMode: { ESPECES: { ecart: 500 } },
        user: { id: "u2", nom: "Caissier2", email: "c2@t.com" },
      },
      {
        id: "s-2",
        userId: "u2",
        fermetureAt: new Date(),
        ecartsParMode: { ESPECES: { ecart: 200 } },
        user: { id: "u2", nom: "Caissier2", email: "c2@t.com" },
      },
    ];
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.caissiers).toHaveLength(0);
  });

  it("inclut les seuils dans la réponse", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.seuils).toEqual({ recurringCount: 3, periodDays: 7 });
  });

  it("renvoie 500 en cas d'erreur", async () => {
    mockAuth();
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });
});
