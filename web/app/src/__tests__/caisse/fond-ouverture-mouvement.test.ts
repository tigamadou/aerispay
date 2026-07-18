/**
 * Lot G — RULE-FOND-001/004.
 * À l'ouverture, un MouvementCaisse FOND_OUVERTURE est créé par mode (= montant retenu),
 * rattaché à la session, de sorte que computeSoldeSession l'inclut nativement.
 * L'écart d'ouverture est catégorisé via les seuils paramétrables et imputé à la
 * session précédente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), create: vi.fn() },
    terminalCaisse: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
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
  computeSoldeCaisseParMode: vi.fn(),
}));
vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) =>
    ({ THRESHOLD_DISCREPANCY_MINOR: 500, THRESHOLD_DISCREPANCY_MAJOR: 5000 } as Record<string, number>)[id] ?? 0,
  ),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { createMovementInTx, computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

function openReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/comptoir/sessions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("Lot G — FOND_OUVERTURE à l'ouverture", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/route")).POST;
    (prisma.terminalCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "caisse-1", active: true }]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "s-new", ouvertureAt: new Date(), ...data,
            user: { id: "user-1", nom: "T", email: "t@t.com" },
          })),
        },
      };
      return fn(tx);
    });
  });

  it("crée un FOND_OUVERTURE par mode déclaré, rattaché à la session", async () => {
    mockUser("CAISSIER");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 20000 },
      { mode: "MOBILE_MONEY_MTN", solde: 5000 },
    ]);

    const res = await POST(openReq({ declarations: { ESPECES: 20000, MOBILE_MONEY_MTN: 5000 } }));
    expect(res.status).toBe(201);

    expect(createMovementInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "FOND_OUVERTURE", mode: "ESPECES", montant: 20000, sessionId: "s-new" }),
    );
    expect(createMovementInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "FOND_OUVERTURE", mode: "MOBILE_MONEY_MTN", montant: 5000, sessionId: "s-new" }),
    );
  });

  it("impute l'écart d'ouverture à la session précédente et le catégorise via getSeuil", async () => {
    mockUser("CAISSIER");
    // Grand livre 20000, déclaré 26000 -> écart +6000 (> 5000 -> MAJEUR via seuils)
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([{ mode: "ESPECES", solde: 20000 }]);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s-prev" });

    const res = await POST(openReq({ declarations: { ESPECES: 26000 }, confirmeEcart: true }));
    expect(res.status).toBe(201);

    const txCreate = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const created = await txCreate;
    expect(created.ecartOuvertureImputeSessionId).toBe("s-prev");
    const ecarts = created.ecartsOuverture as Array<{ categorie: string; ecart: number }>;
    expect(ecarts[0].categorie).toBe("MAJEUR");
    expect(ecarts[0].ecart).toBe(6000);
  });
});
