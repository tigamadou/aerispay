import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    terminalCaisse: { findMany: vi.fn() },
    comptoirSession: { findFirst: vi.fn() },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/services/cash-movement", () => ({ computeSoldeCaisseParMode: vi.fn() }));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1", email: "t@t.com", name: "T", role } });
}

describe("GET /api/terminaux?state=1&includeInactive=1", () => {
  let GET: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import("@/app/api/terminaux/route"));
  });

  it("renvoie inactifs + session ouverte + solde espèces", async () => {
    mockSession("ADMIN");
    (prisma.terminalCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t1", code: "P1", nom: "Terminal principal", active: true, createdAt: new Date("2026-01-01") },
      { id: "t2", code: "P2", nom: "Terminal 2", active: false, createdAt: new Date("2026-01-02") },
    ]);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "s1", ouvertureAt: new Date("2026-06-30T08:00:00Z"), user: { nom: "Awa" } })
      .mockResolvedValueOnce(null);
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ mode: "ESPECES", solde: 45000 }])
      .mockResolvedValueOnce([]);

    const res = await GET(new Request("http://x/api/terminaux?state=1&includeInactive=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ code: "P1", soldeEspeces: 45000, sessionOuverte: { caissier: "Awa" } });
    expect(body.data[1]).toMatchObject({ code: "P2", active: false, soldeEspeces: 0, sessionOuverte: null });
    expect(prisma.terminalCaisse.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("sans state : terminaux actifs bruts (rétrocompat)", async () => {
    mockSession("MANAGER");
    (prisma.terminalCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t1", code: "P1", nom: "Terminal principal", active: true, createdAt: new Date() },
    ]);
    const res = await GET(new Request("http://x/api/terminaux"));
    const body = await res.json();
    expect(prisma.terminalCaisse.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
    expect(body.data[0].soldeEspeces).toBeUndefined();
  });

  it("403 si rôle sans rapports:consulter", async () => {
    mockSession("CAISSIER");
    const res = await GET(new Request("http://x/api/terminaux?state=1"));
    expect(res.status).toBe(403);
  });
});
