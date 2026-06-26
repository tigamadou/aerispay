/**
 * Lot C (C1, Option A — tiroir partagé séquentiel) — RULE-CAISSE-002.
 * Au plus UNE session OUVERTE à la fois (globalement, pas seulement par utilisateur).
 * L'ouverture d'une 2ᵉ session alors qu'une session d'un AUTRE caissier est déjà
 * ouverte est refusée (409).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findFirst: vi.fn(), create: vi.fn() },
    caisse: { findFirst: vi.fn() },
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

describe("Lot C — unicité globale de session OUVERTE (Option A)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/route")).POST;
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });
  });

  it("refuse (409) une 2ᵉ session si une session d'un AUTRE caissier est déjà ouverte", async () => {
    mockUser("CAISSIER", "caissier-B");

    let unicityWhere: Record<string, unknown> | undefined;
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        comptoirSession: {
          // Une session d'un autre utilisateur (caissier-A) est déjà OUVERTE
          findFirst: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
            unicityWhere = where;
            return { id: "s-A", statut: "OUVERTE", userId: "caissier-A" };
          }),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const res = await POST(new Request("http://localhost/api/comptoir/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarations: { ESPECES: 20000 } }),
    }));

    expect(res.status).toBe(409);
    // La garde d'unicité ne doit PAS être restreinte à l'utilisateur courant
    expect(unicityWhere).toEqual({ statut: "OUVERTE" });
  });
});
