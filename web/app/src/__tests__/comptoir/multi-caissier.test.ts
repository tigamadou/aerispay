/**
 * F1.1 — Multi-caissier / multi-caisse (Option B).
 * Deux caissiers ouvrent simultanément des sessions sur des caisses DISTINCTES :
 * les deux ouvertures réussissent (201) et chaque session porte sa propre terminalId.
 * L'unicité reste garantie par caisse ET par caissier (cf. session-caisse-unicite).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), create: vi.fn() },
    terminalCaisse: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { COMPTOIR_SESSION_OPENED: "COMPTOIR_SESSION_OPENED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));
vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 20000 }]),
}));
vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockResolvedValue(500),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockUser(role: Role, id: string) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: `${id}@t.com`, name: id, role },
  });
}

function openOn(terminalId: string, userId: string) {
  (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: terminalId, active: true });
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
    const tx = {
      comptoirSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: `session-${terminalId}`, terminalId, userId, statut: "OUVERTE",
          ouvertureAt: new Date(), montantOuvertureCash: 20000, montantOuvertureMobileMoney: 0,
        }),
      },
    };
    return fn(tx);
  });
  return new Request("http://localhost/api/comptoir/sessions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ declarations: { ESPECES: 20000 }, terminalId }),
  });
}

describe("F1.1 — sessions concurrentes sur caisses distinctes", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/route")).POST;
  });

  it("caissier A ouvre sur caisse-1 → 201 avec terminalId caisse-1", async () => {
    mockUser("CAISSIER", "caissier-A");
    const res = await POST(openOn("caisse-1", "caissier-A"));
    expect(res.status).toBe(201);
    expect((await res.json()).data.terminalId).toBe("caisse-1");
  });

  it("caissier B ouvre sur caisse-2 → 201 avec terminalId caisse-2", async () => {
    mockUser("CAISSIER", "caissier-B");
    const res = await POST(openOn("caisse-2", "caissier-B"));
    expect(res.status).toBe(201);
    expect((await res.json()).data.terminalId).toBe("caisse-2");
  });
});
