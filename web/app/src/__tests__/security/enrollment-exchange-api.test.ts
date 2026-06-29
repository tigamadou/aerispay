import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { caisse: { findUnique: vi.fn(), update: vi.fn() } },
}));
const consumeEnrollmentToken = vi.fn();
vi.mock("@/lib/services/enrollment-token", () => ({
  consumeEnrollmentToken: (...a: unknown[]) => consumeEnrollmentToken(...a),
}));
const issueStoreToken = vi.fn();
vi.mock("@/lib/services/store-token", () => ({
  issueStoreToken: (...a: unknown[]) => issueStoreToken(...a),
}));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(), ACTIONS: { POSTE_ENROLLED: "POSTE_ENROLLED" }, getClientIp: vi.fn(), getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";

function req(body: unknown) {
  return new Request("http://localhost/api/enrollment/exchange", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/enrollment/exchange", () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/enrollment/exchange/route")).POST;
  });

  it("code valide + nom → 200, consomme, renomme, émet store token", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: true, caisseId: "c1", tokenId: "et-1" });
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", active: true, code: "P1", nom: "Ancien" });
    (prisma.caisse.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", code: "P1", nom: "Caisse Entrée" });
    issueStoreToken.mockResolvedValue({ token: "s".repeat(64), id: "st-1" });

    const res = await POST(req({ token: "a".repeat(64), nom: "Caisse Entrée" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.storeToken).toBe("s".repeat(64));
    expect(body.data.caisseId).toBe("c1");
    expect(body.data.codePoste).toBe("P1");
    expect(body.data.nom).toBe("Caisse Entrée");
    expect(prisma.caisse.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nom: "Caisse Entrée" }, select: { id: true, code: true, nom: true } });
  });

  it("nom vide → ne renomme pas, garde le nom existant", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: true, caisseId: "c1", tokenId: "et-1" });
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", active: true, code: "P1", nom: "Existant" });
    issueStoreToken.mockResolvedValue({ token: "s".repeat(64), id: "st-1" });

    const res = await POST(req({ token: "a".repeat(64) }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.nom).toBe("Existant");
    expect(prisma.caisse.update).not.toHaveBeenCalled();
  });

  it("code invalide/expiré/consommé → 401, pas de store token", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: false, caisseId: null, tokenId: null });
    const res = await POST(req({ token: "a".repeat(64) }));
    expect(res.status).toBe(401);
    expect(issueStoreToken).not.toHaveBeenCalled();
  });

  it("caisse inactive → 422", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: true, caisseId: "c1", tokenId: "et-1" });
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", active: false, code: "P1", nom: "X" });
    const res = await POST(req({ token: "a".repeat(64) }));
    expect(res.status).toBe(422);
    expect(issueStoreToken).not.toHaveBeenCalled();
  });

  it("token manquant → 400", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
