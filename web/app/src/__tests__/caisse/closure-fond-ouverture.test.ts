/**
 * Lot G + A — Le théorique de clôture provient du SOLDE DE SESSION
 * (computeSoldeSession = Σ mouvements de la session, FOND_OUVERTURE inclus),
 * et NON plus du grand livre. C'est la même base que la validation à l'aveugle :
 * pour un tiroir compté en entier, clôture et validation donnent le même écart.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
    terminalCaisse: { findFirst: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SESSION_CLOSURE_REQUESTED: "SESSION_CLOSURE_REQUESTED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeSession: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeSession } from "@/lib/services/cash-movement";

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Lot G+A — clôture sur le solde de session (fond inclus)", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: "s-1" }) };

  const openSession = {
    id: "s-1", statut: "OUVERTE", userId: "user-1",
    montantOuvertureCash: 20000, montantOuvertureMobileMoney: 0,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/closure/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession, ...data, user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );
  });

  it("le théorique de clôture provient de computeSoldeSession (fond + recettes)", async () => {
    mockUser("CAISSIER");
    // Solde de session : 20000 (FOND_OUVERTURE) + 5000 (recettes) = 25000
    (computeSoldeSession as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 25000 },
    ]);

    // Le caissier compte le tiroir entier : 25000 -> écart 0
    const res = await POST(jsonReq({ declarations: { ESPECES: 25000 } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(computeSoldeSession).toHaveBeenCalledWith("s-1");
    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(25000);
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(0);
  });

  it("détecte un déficit réel sur la base de session", async () => {
    mockUser("CAISSIER");
    (computeSoldeSession as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 28000 },
    ]);

    const res = await POST(jsonReq({ declarations: { ESPECES: 25000 } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(28000);
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(-3000);
  });
});
