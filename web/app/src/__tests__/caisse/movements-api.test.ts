import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn() },
    mouvementCaisse: { create: vi.fn(), findMany: vi.fn() },
    seuilCaisse: { findMany: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { CASH_MOVEMENT_CREATED: "CASH_MOVEMENT_CREATED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  createMovement: vi.fn().mockResolvedValue({
    id: "mv-1", type: "APPORT", mode: "ESPECES", montant: 5000,
    sessionId: "s-1", auteurId: "user-1", createdAt: new Date(),
  }),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([
    { mode: "ESPECES", solde: 50000 },
  ]),
}));

vi.mock("@/lib/services/seuils", () => ({
  getSeuil: vi.fn().mockImplementation(async (id: string) => {
    const defaults: Record<string, number> = {
      THRESHOLD_CASH_WITHDRAWAL_AUTH: 10000,
      THRESHOLD_EXPENSE_AUTH: 5000,
    };
    return defaults[id] ?? 0;
  }),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { createMovement, computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/comptoir/movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const openSession = { id: "s-1", statut: "OUVERTE", userId: "user-1" };

const validApport = {
  sessionId: "s-1",
  type: "APPORT",
  mode: "ESPECES",
  montant: 5000,
  motif: "Apport de monnaie",
};

describe("POST /api/comptoir/movements", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/movements/route")).POST;
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    // Restore default mocks after clearAllMocks
    (createMovement as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "mv-1", type: "APPORT", mode: "ESPECES", montant: 5000,
      sessionId: "s-1", auteurId: "user-1", createdAt: new Date(),
    });
    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 50000 },
    ]);
  });

  // ─── Auth ─────────────────────────────────────────

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(401);
  });

  // ─── APPORT ───────────────────────────────────────

  it("CAISSIER creates APPORT successfully", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(201);
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "APPORT", mode: "ESPECES", montant: 5000 }),
    );
  });

  it("MANAGER creates APPORT successfully", async () => {
    mockSession("MANAGER");
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(201);
  });

  it("ADMIN creates APPORT successfully", async () => {
    mockSession("ADMIN");
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(201);
  });

  // ─── RETRAIT ──────────────────────────────────────

  it("CAISSIER creates RETRAIT within threshold", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({
      ...validApport, type: "RETRAIT", montant: 8000, motif: "Retrait courant",
    }));
    expect(res.status).toBe(201);
    // Signed montant is negative for outflow
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RETRAIT", montant: -8000 }),
    );
  });

  it("CAISSIER RETRAIT above threshold returns 403", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({
      ...validApport, type: "RETRAIT", montant: 15000, motif: "Gros retrait",
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("seuil");
  });

  it("MANAGER RETRAIT above threshold succeeds (no threshold check)", async () => {
    mockSession("MANAGER");
    const res = await POST(jsonReq({
      ...validApport, type: "RETRAIT", montant: 15000, motif: "Retrait autorise",
    }));
    expect(res.status).toBe(201);
  });

  it("RETRAIT exceeding cash balance returns 422", async () => {
    mockSession("MANAGER");
    (computeSoldeTheoriqueParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 5000 },
    ]);
    const res = await POST(jsonReq({
      ...validApport, type: "RETRAIT", montant: 10000, motif: "Retrait trop important",
    }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("insuffisant");
  });

  // ─── DEPENSE ──────────────────────────────────────

  it("CAISSIER creates DEPENSE within threshold", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({
      ...validApport, type: "DEPENSE", montant: 3000, motif: "Achat fournitures bureau",
    }));
    expect(res.status).toBe(201);
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DEPENSE", montant: -3000 }),
    );
  });

  it("CAISSIER DEPENSE above threshold returns 403", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({
      ...validApport, type: "DEPENSE", montant: 8000, motif: "Grosse depense fournitures",
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("seuil");
  });

  it("ADMIN DEPENSE above threshold succeeds", async () => {
    mockSession("ADMIN");
    const res = await POST(jsonReq({
      ...validApport, type: "DEPENSE", montant: 50000, motif: "Depense exceptionnelle autorisee",
    }));
    expect(res.status).toBe(201);
  });

  it("DEPENSE with justificatif is accepted", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({
      ...validApport, type: "DEPENSE", montant: 2000,
      motif: "Achat petit materiel", justificatif: "facture-001.pdf",
    }));
    expect(res.status).toBe(201);
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ justificatif: "facture-001.pdf" }),
    );
  });

  // ─── Session checks ───────────────────────────────

  it("returns 404 if session not found", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(404);
  });

  it("returns 422 if session is not OUVERTE", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...openSession, statut: "FERMEE",
    });
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(422);
  });

  // ─── Validation ───────────────────────────────────

  it("returns 400 for invalid body", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({ sessionId: "s-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type (VENTE not allowed)", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({ ...validApport, type: "VENTE" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero montant", async () => {
    mockSession("CAISSIER");
    const res = await POST(jsonReq({ ...validApport, montant: 0 }));
    expect(res.status).toBe(400);
  });

  // ─── Error handling ───────────────────────────────

  it("returns 500 on unexpected error", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await POST(jsonReq(validApport));
    expect(res.status).toBe(500);
  });
});
