/**
 * E3.1 — Enrôlement d'un poste (côté nœud).
 * Un ADMIN enrôle une caisse : le nœud émet un token de magasin scoppé à cette caisse
 * (caisseId = identité du poste, fixée à l'enrôlement, ADR-001/E3.2). Le token (clair)
 * n'est renvoyé qu'une fois, à stocker dans le trousseau OS du poste.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: { caisse: { findUnique: vi.fn() } },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { POSTE_ENROLLED: "POSTE_ENROLLED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));
const issueStoreToken = vi.fn();
vi.mock("@/lib/services/store-token", () => ({
  issueStoreToken: (...a: unknown[]) => issueStoreToken(...a),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockUser(role: Role, id = "admin-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, email: "a@t.com", name: "A", role } });
}

function req(body: unknown) {
  return new Request("http://localhost/api/enrollment", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/enrollment", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/enrollment/route")).POST;
  });

  it("ADMIN enrôle une caisse active → 201 + token scoppé", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true, code: "P1" });
    issueStoreToken.mockResolvedValue({ token: "a".repeat(64), id: "tok-1" });

    const res = await POST(req({ caisseId: "caisse-1", label: "Poste 1" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.token).toBe("a".repeat(64));
    expect(body.data.caisseId).toBe("caisse-1");
    expect(issueStoreToken).toHaveBeenCalledWith({ caisseId: "caisse-1", label: "Poste 1" });
  });

  it("CAISSIER → 403", async () => {
    mockUser("CAISSIER");
    const res = await POST(req({ caisseId: "caisse-1" }));
    expect(res.status).toBe(403);
    expect(issueStoreToken).not.toHaveBeenCalled();
  });

  it("caisse introuvable ou inactive → 422", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req({ caisseId: "x" }));
    expect(res.status).toBe(422);
  });

  it("caisseId manquant → 400", async () => {
    mockUser("ADMIN");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
