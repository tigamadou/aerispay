import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Mocks ───────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { findUnique: vi.fn() },
    comptoirSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    parametres: { findUnique: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
    paiement: { findMany: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    TICKET_PDF_DOWNLOADED: "TICKET_PDF_DOWNLOADED",
    COMPTOIR_SESSION_CLOSED: "COMPTOIR_SESSION_CLOSED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/receipt/pdf-generator", () => ({
  generateReceiptPDF: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeTheoriqueLegacy: vi.fn().mockResolvedValue({ cash: 0, mobileMoney: 0 }),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([]),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([]),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// ─── Helpers ─────────────────────────────────────────

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "test@aerispay.com", name: "Test", role },
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ─── Mock data ───────────────────────────────────────

const venteOwnerA = {
  id: "vente-A",
  numero: "VTE-001",
  dateVente: new Date(),
  sousTotal: new Decimal(1000),
  remise: new Decimal(0),
  tva: new Decimal(180),
  total: new Decimal(1180),
  taxesDetail: null,
  statut: "VALIDEE",
  nomClient: null,
  notesCaissier: null,
  sessionId: "s-1",
  userId: "caissier-A", // belongs to caissier-A
  lignes: [],
  paiements: [],
  caissier: { id: "caissier-A", nom: "CaissierA", email: "a@test.com" },
  session: { id: "s-1", ouvertureAt: new Date() },
};

const sessionOwnerA = {
  id: "session-A",
  userId: "caissier-A",
  statut: "OUVERTE",
  ouvertureAt: new Date(),
  fermetureAt: null,
  montantOuvertureCash: new Decimal(50000),
  montantOuvertureMobileMoney: new Decimal(0),
  montantFermetureCash: null,
  montantFermetureMobileMoney: null,
  soldeTheoriqueCash: null,
  soldeTheoriqueMobileMoney: null,
  ecartCash: null,
  ecartMobileMoney: null,
  notes: null,
  user: { id: "caissier-A", nom: "CaissierA", email: "a@test.com" },
  ventes: [],
};

// ═══════════════════════════════════════════════════════
// GET /api/ventes/[id] — IDOR protection
// ═══════════════════════════════════════════════════════

describe("IDOR: GET /api/ventes/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/ventes/[id]/route")).GET;
  });

  it("CAISSIER B cannot access sale of CAISSIER A → 403", async () => {
    mockUser("CAISSIER", "caissier-B");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOwnerA);

    const res = await GET(
      new Request("http://localhost/api/ventes/vente-A"),
      makeParams("vente-A"),
    );
    expect(res.status).toBe(403);
  });

  it("CAISSIER A can access their own sale → 200", async () => {
    mockUser("CAISSIER", "caissier-A");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOwnerA);

    const res = await GET(
      new Request("http://localhost/api/ventes/vente-A"),
      makeParams("vente-A"),
    );
    expect(res.status).toBe(200);
  });

  it("ADMIN can access any sale → 200", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOwnerA);

    const res = await GET(
      new Request("http://localhost/api/ventes/vente-A"),
      makeParams("vente-A"),
    );
    expect(res.status).toBe(200);
  });

  it("MANAGER can access any sale → 200", async () => {
    mockUser("MANAGER", "manager-1");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOwnerA);

    const res = await GET(
      new Request("http://localhost/api/ventes/vente-A"),
      makeParams("vente-A"),
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/comptoir/sessions/[id] — IDOR protection
// ═══════════════════════════════════════════════════════

describe("IDOR: GET /api/comptoir/sessions/[id]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/sessions/[id]/route")).GET;
  });

  it("CAISSIER B cannot access session of CAISSIER A → 403", async () => {
    mockUser("CAISSIER", "caissier-B");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sessionOwnerA);

    const res = await GET(
      new Request("http://localhost/api/comptoir/sessions/session-A"),
      makeParams("session-A"),
    );
    expect(res.status).toBe(403);
  });

  it("CAISSIER A can access their own session → 200", async () => {
    mockUser("CAISSIER", "caissier-A");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sessionOwnerA);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.paiement.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/comptoir/sessions/session-A"),
      makeParams("session-A"),
    );
    expect(res.status).toBe(200);
  });

  it("ADMIN can access any session → 200", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sessionOwnerA);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.paiement.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/comptoir/sessions/session-A"),
      makeParams("session-A"),
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/comptoir/sessions — listing filter
// ═══════════════════════════════════════════════════════

describe("IDOR: GET /api/comptoir/sessions (listing)", () => {
  let GET: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/comptoir/sessions/route")).GET;
  });

  it("CAISSIER listing filters by own userId", async () => {
    mockUser("CAISSIER", "caissier-B");
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(prisma.comptoirSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "caissier-B" },
      }),
    );
  });

  it("ADMIN listing has no userId filter", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.comptoirSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(prisma.comptoirSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/tickets/[id]/pdf — IDOR protection
// ═══════════════════════════════════════════════════════

describe("IDOR: GET /api/tickets/[id]/pdf", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/tickets/[id]/pdf/route")).GET;
  });

  it("CAISSIER B cannot download ticket of CAISSIER A → 403", async () => {
    mockUser("CAISSIER", "caissier-B");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOwnerA);

    const res = await GET(
      new Request("http://localhost/api/tickets/vente-A/pdf"),
      makeParams("vente-A"),
    );
    expect(res.status).toBe(403);
  });

  it("ADMIN can download any ticket → 200", async () => {
    mockUser("ADMIN", "admin-1");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(venteOwnerA);
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/tickets/vente-A/pdf"),
      makeParams("vente-A"),
    );
    expect(res.status).toBe(200);
  });
});
