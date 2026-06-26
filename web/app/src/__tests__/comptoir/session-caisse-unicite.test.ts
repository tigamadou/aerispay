/**
 * F1.1 — Lot C (Option B) — RULE-CAISSE-002 multi-caisse.
 * Unicité : 1 session OUVERTE par caisse ET 1 par caissier.
 * - 2ᵉ ouverture sur une caisse déjà OUVERTE → 409 (garde scopée à la caisse résolue)
 * - un caissier ayant déjà une session ouverte → 409 même sur une autre caisse
 * - une autre caisse libre + un autre caissier → 201
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), create: vi.fn() },
    caisse: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
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
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "t@t.com", name: "T", role } });
}

describe("F1.1 — unicité par caisse ET par caissier (Option B)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/route")).POST;
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });
  });

  it("refuse (409) une 2ᵉ ouverture sur une caisse déjà OUVERTE, garde scopée à la caisse", async () => {
    mockUser("CAISSIER", "caissier-B");

    let caisseCheckWhere: Record<string, unknown> | undefined;
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          findFirst: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
            caisseCheckWhere = where;
            if (where.caisseId === "caisse-1") {
              return { id: "s-A", statut: "OUVERTE", caisseId: "caisse-1", userId: "caissier-A" };
            }
            return null;
          }),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/comptoir/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 20000 }, caisseId: "caisse-1" }),
    }));

    expect(res.status).toBe(409);
    expect(caisseCheckWhere).toMatchObject({ statut: "OUVERTE", caisseId: "caisse-1" });
  });

  it("refuse (409) si le caissier a déjà une session OUVERTE (même sur une autre caisse)", async () => {
    mockUser("CAISSIER", "caissier-A");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-2", active: true });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          findFirst: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
            if (where.caisseId === "caisse-2") return null;
            if (where.userId === "caissier-A") {
              return { id: "s-A", statut: "OUVERTE", caisseId: "caisse-1", userId: "caissier-A" };
            }
            return null;
          }),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/comptoir/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 20000 }, caisseId: "caisse-2" }),
    }));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/session.*ouverte|déjà.*session/i);
  });

  it("autorise (201) une session sur une caisse libre par un autre caissier", async () => {
    mockUser("CAISSIER", "caissier-B");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-2", active: true });

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "session-B",
            caisseId: "caisse-2",
            userId: "caissier-B",
            statut: "OUVERTE",
            ouvertureAt: new Date(),
            montantOuvertureCash: 20000,
            montantOuvertureMobileMoney: 0,
          }),
        },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/comptoir/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 20000 }, caisseId: "caisse-2" }),
    }));

    expect(res.status).toBe(201);
  });
});
