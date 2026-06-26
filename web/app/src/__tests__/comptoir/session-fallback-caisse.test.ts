/**
 * F1.1 — Multi-caisse : résolution de la caisse à l'ouverture de session.
 * - 1 seule caisse active → fallback automatique (201)
 * - 0 caisse active → 422
 * - ≥ 2 caisses actives + caisseId absent → 400
 * - caisseId fourni et actif → 201 ; introuvable/inactif → 422
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), create: vi.fn() },
    caisse: { findUnique: vi.fn(), findMany: vi.fn() },
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

function mockUser(role: Role, id = "caissier-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function mockTransactionOk(caisseId: string) {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
    const tx = {
      comptoirSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "session-1", caisseId, userId: "caissier-1", statut: "OUVERTE",
          ouvertureAt: new Date(), montantOuvertureCash: 20000, montantOuvertureMobileMoney: 0,
        }),
      },
    };
    return fn(tx);
  });
}

const body = JSON.stringify({ declarations: { ESPECES: 20000 } });
const makeReq = (b = body) =>
  new Request("http://localhost/api/comptoir/sessions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: b,
  });

describe("F1.1 — Résolution multi-caisse à l'ouverture", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/route")).POST;
  });

  it("fallback : 1 seule caisse active → 201", async () => {
    mockUser("CAISSIER");
    (prisma.caisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "caisse-principale", active: true }]);
    mockTransactionOk("caisse-principale");
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
  });

  it("0 caisse active → 422", async () => {
    mockUser("CAISSIER");
    (prisma.caisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await POST(makeReq());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/aucune caisse/i);
  });

  it("≥ 2 caisses actives + caisseId absent → 400", async () => {
    mockUser("CAISSIER");
    (prisma.caisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "caisse-1", active: true }, { id: "caisse-2", active: true },
    ]);
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/caisseId requis/i);
  });

  it("caisseId fourni et actif → 201", async () => {
    mockUser("CAISSIER");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });
    mockTransactionOk("caisse-1");
    const res = await POST(makeReq(JSON.stringify({ declarations: { ESPECES: 20000 }, caisseId: "caisse-1" })));
    expect(res.status).toBe(201);
  });

  it("caisseId introuvable → 422", async () => {
    mockUser("CAISSIER");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeReq(JSON.stringify({ declarations: { ESPECES: 20000 }, caisseId: "x" })));
    expect(res.status).toBe(422);
  });

  it("caisseId inactif → 422", async () => {
    mockUser("CAISSIER");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: false });
    const res = await POST(makeReq(JSON.stringify({ declarations: { ESPECES: 20000 }, caisseId: "caisse-1" })));
    expect(res.status).toBe(422);
  });
});
