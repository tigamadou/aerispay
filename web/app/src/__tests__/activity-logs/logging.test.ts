import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    produit: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    categorie: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    mouvementStock: { findMany: vi.fn(), count: vi.fn() },
    vente: { findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    comptoirSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    caisse: { findFirst: vi.fn() },
    paiement: { aggregate: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("$2a$12$hashed"),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  ACTIONS: {
    USER_CREATED: "USER_CREATED",
    USER_UPDATED: "USER_UPDATED",
    USER_DEACTIVATED: "USER_DEACTIVATED",
    PRODUCT_CREATED: "PRODUCT_CREATED",
    PRODUCT_UPDATED: "PRODUCT_UPDATED",
    PRODUCT_DEACTIVATED: "PRODUCT_DEACTIVATED",
    CATEGORY_CREATED: "CATEGORY_CREATED",
    CATEGORY_DELETED: "CATEGORY_DELETED",
    STOCK_MOVEMENT_CREATED: "STOCK_MOVEMENT_CREATED",
    SALE_COMPLETED: "SALE_COMPLETED",
    SALE_CANCELLED: "SALE_CANCELLED",
    COMPTOIR_SESSION_OPENED: "COMPTOIR_SESSION_OPENED",
    COMPTOIR_SESSION_CLOSED: "COMPTOIR_SESSION_CLOSED",
    CASH_DRAWER_OPENED: "CASH_DRAWER_OPENED",
    CASH_DRAWER_OPEN_FAILED: "CASH_DRAWER_OPEN_FAILED",
    TICKET_THERMAL_PRINT_REQUESTED: "TICKET_THERMAL_PRINT_REQUESTED",
  },
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  getClientUserAgent: vi.fn().mockReturnValue("test-agent"),
}));

vi.mock("@/lib/receipt/thermal-printer", () => ({
  printReceipt: vi.fn().mockResolvedValue({ success: true, message: "OK" }),
  openCashDrawer: vi.fn().mockResolvedValue({ success: true, message: "OK" }),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  createMovementInTx: vi.fn(),
  computeSoldeTheoriqueLegacy: vi.fn().mockResolvedValue({ cash: 0, mobileMoney: 0 }),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([]),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 50000 }]),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── USER LOGGING ───────────────────────────────────

describe("User activity logging", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("logs USER_CREATED on POST /api/users", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u-new", nom: "Bob", email: "bob@test.com", role: "CAISSIER", actif: true, motDePasse: "$hash",
      createdAt: new Date(), updatedAt: new Date(),
    });

    const { POST } = await import("@/app/api/users/route");
    const res = await POST(jsonReq("http://localhost/api/users", "POST", {
      nom: "Bob", email: "bob@test.com", motDePasse: "Secure123!", role: "CAISSIER",
    }));
    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_CREATED", entityType: "User", entityId: "u-new" })
    );
  });

  it("logs USER_DEACTIVATED when actif set to false", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u-1", nom: "Alice", email: "alice@test.com", role: "CAISSIER", actif: true, motDePasse: "$hash",
    });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u-1", nom: "Alice", email: "alice@test.com", role: "CAISSIER", actif: false, motDePasse: "$hash",
    });

    const { PUT } = await import("@/app/api/users/[id]/route");
    const res = await PUT(
      jsonReq("http://localhost/api/users/u-1", "PUT", { actif: false }),
      { params: Promise.resolve({ id: "u-1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_DEACTIVATED", entityId: "u-1" })
    );
  });

  it("logs USER_UPDATED on regular update", async () => {
    mockSession("ADMIN");
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u-1", nom: "Alice", email: "alice@test.com", role: "CAISSIER", actif: true, motDePasse: "$hash",
    });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u-1", nom: "Alice B", email: "alice@test.com", role: "CAISSIER", actif: true, motDePasse: "$hash",
    });

    const { PUT } = await import("@/app/api/users/[id]/route");
    const res = await PUT(
      jsonReq("http://localhost/api/users/u-1", "PUT", { nom: "Alice B" }),
      { params: Promise.resolve({ id: "u-1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_UPDATED", entityId: "u-1" })
    );
  });
});

// ─── SALE LOGGING ───────────────────────────────────

describe("Sale activity logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1" });
  });

  it("logs SALE_CANCELLED on POST /api/ventes/[id]/annuler", async () => {
    mockSession("ADMIN");
    const mockVente = {
      id: "v-1", numero: "VTE-2026-00001", statut: "VALIDEE", total: new Decimal(5000),
      sousTotal: new Decimal(5000), remise: new Decimal(0), tva: new Decimal(0),
      dateVente: new Date("2026-04-23T14:00:00Z"), sessionId: "s-1",
      lignes: [{ id: "l1", produitId: "p1", quantite: 2, produit: { id: "p1", nom: "X", stockActuel: 10 } }],
    };
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockVente);
    // P0-003: session must be OUVERTE for cancellation
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-1", statut: "OUVERTE", userId: "user-1",
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockVente, statut: "ANNULEE", paiements: [], caissier: { id: "u-1", nom: "Test" },
      lignes: mockVente.lignes.map(l => ({ ...l, produit: { ...l.produit, stockActuel: 12 } })),
    });

    const { POST } = await import("@/app/api/ventes/[id]/annuler/route");
    const res = await POST(
      new Request("http://localhost/api/ventes/v-1/annuler", { method: "POST" }),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SALE_CANCELLED", entityType: "Sale", entityId: "v-1" })
    );
  });
});

// ─── CASH SESSION LOGGING ───────────────────────────

describe("Cash session activity logging", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("logs COMPTOIR_SESSION_OPENED on POST /api/comptoir/sessions", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });
    const mockCreatedSession = {
      id: "s-1", montantOuvertureCash: new Decimal(50000), montantOuvertureMobileMoney: new Decimal(0), userId: "user-1",
      ouvertureAt: new Date("2026-04-23T08:00:00Z"),
      user: { id: "user-1", nom: "Test", email: "test@test.com" },
    };
    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedSession);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)
    );

    const { POST } = await import("@/app/api/comptoir/sessions/route");
    const res = await POST(jsonReq("http://localhost/api/comptoir/sessions", "POST", { montantOuvertureCash: 50000 }));
    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMPTOIR_SESSION_OPENED", entityType: "ComptoirSession", entityId: "s-1" })
    );
  });
});

// ─── CASH DRAWER LOGGING ────────────────────────────

describe("Cash drawer activity logging", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("logs CASH_DRAWER_OPENED on successful open", async () => {
    mockSession("CAISSIER");
    const { openCashDrawer } = await import("@/lib/receipt/thermal-printer");
    (openCashDrawer as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, message: "OK" });

    const { POST } = await import("@/app/api/cash-drawer/open/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CASH_DRAWER_OPENED" })
    );
  });

  it("logs CASH_DRAWER_OPEN_FAILED on failure", async () => {
    mockSession("CAISSIER");
    const { openCashDrawer } = await import("@/lib/receipt/thermal-printer");
    (openCashDrawer as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, message: "Printer offline" });

    const { POST } = await import("@/app/api/cash-drawer/open/route");
    const res = await POST();
    expect(res.status).toBe(503);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CASH_DRAWER_OPEN_FAILED" })
    );
  });
});

// ─── TICKET PRINT LOGGING ──────────────────────────

describe("Ticket print activity logging", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("logs TICKET_THERMAL_PRINT_REQUESTED", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "v-1" });

    const { POST } = await import("@/app/api/tickets/[id]/print/route");
    const res = await POST(
      new Request("http://localhost/api/tickets/v-1/print", { method: "POST" }),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TICKET_THERMAL_PRINT_REQUESTED", entityType: "Sale", entityId: "v-1" })
    );
  });
});
