/**
 * Enrôlement d'un poste (côté nœud) — ADR-007.
 * Un ADMIN génère un CODE D'ENRÔLEMENT à usage unique pour une caisse pré-créée.
 * Le poste l'échange ensuite (POST /api/enrollment/exchange) contre un token de magasin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: { terminalCaisse: { findUnique: vi.fn() } },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { POSTE_ENROLLED: "POSTE_ENROLLED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));
const issueEnrollmentToken = vi.fn();
vi.mock("@/lib/services/enrollment-token", () => ({
  issueEnrollmentToken: (...a: unknown[]) => issueEnrollmentToken(...a),
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

  it("ADMIN génère un code d'enrôlement pour une caisse active → 201", async () => {
    mockUser("ADMIN");
    (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true, code: "P1" });
    const expiresAt = new Date(Date.now() + 3_600_000);
    issueEnrollmentToken.mockResolvedValue({ token: "a".repeat(64), id: "et-1", expiresAt });

    const res = await POST(req({ terminalId: "caisse-1", label: "Poste 1" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.enrollmentToken).toBe("a".repeat(64));
    expect(body.data.terminalId).toBe("caisse-1");
    expect(body.data.codePoste).toBe("P1");
    expect(issueEnrollmentToken).toHaveBeenCalledWith({ terminalId: "caisse-1", label: "Poste 1", ttlMinutes: undefined });
  });

  it("CAISSIER → 403", async () => {
    mockUser("CAISSIER");
    const res = await POST(req({ terminalId: "caisse-1" }));
    expect(res.status).toBe(403);
    expect(issueEnrollmentToken).not.toHaveBeenCalled();
  });

  it("caisse introuvable ou inactive → 422", async () => {
    mockUser("ADMIN");
    (prisma.terminalCaisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req({ terminalId: "x" }));
    expect(res.status).toBe(422);
    expect(issueEnrollmentToken).not.toHaveBeenCalled();
  });

  it("terminalId manquant → 400", async () => {
    mockUser("ADMIN");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
