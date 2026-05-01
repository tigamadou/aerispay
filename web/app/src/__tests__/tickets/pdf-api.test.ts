import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { findUnique: vi.fn() },
    parametres: { findUnique: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { TICKET_PDF_DOWNLOADED: "TICKET_PDF_DOWNLOADED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/receipt/pdf-generator", () => ({
  generateReceiptPDF: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "Test", role },
  });
}

const sampleVente = {
  id: "v-1",
  numero: "VTE-2026-00001",
  dateVente: new Date("2026-04-23T14:35:00Z"),
  sousTotal: 46100,
  remise: 2305,
  tva: 7884,
  total: 51679,
  statut: "VALIDEE",
  nomClient: null,
  createdAt: new Date("2026-04-23T14:35:00Z"),
  caissier: { id: "user-1", nom: "Amadou", email: "amadou@test.com" },
  session: { id: "s-1", ouvertureAt: new Date("2026-04-23T08:00:00Z") },
  lignes: [
    {
      id: "l-1",
      quantite: 2,
      prixUnitaire: 12500,
      remise: 0,
      tva: 18,
      sousTotal: 25000,
      produit: { id: "p-1", nom: "Farine 50kg", reference: "FAR-001" },
    },
  ],
  paiements: [
    {
      id: "pay-1",
      mode: "ESPECES",
      montant: 55000,
      reference: null,
      createdAt: new Date("2026-04-23T14:35:00Z"),
    },
  ],
};

const sampleParametres = {
  id: "default",
  nomCommerce: "Super Marche",
  adresse: "123 Rue du Commerce",
  telephone: "+221 77 000 00 00",
  email: "contact@super.com",
  rccm: "SN-DKR-2024-B-12345",
  nif: "1234567890",
  logo: null,
};

describe("GET /api/tickets/[id]/pdf", () => {
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/tickets/[id]/pdf/route")).GET;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if vente not found", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "v-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns PDF with correct headers on success", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParametres);

    const { generateReceiptPDF } = await import("@/lib/receipt/pdf-generator");
    const fakePdf = Buffer.from("fake-pdf-content");
    (generateReceiptPDF as ReturnType<typeof vi.fn>).mockResolvedValue(fakePdf);

    const res = await GET(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "v-1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("ticket-VTE-2026-00001.pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("uses default business name when no parametres exist", async () => {
    mockSession("ADMIN");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { generateReceiptPDF } = await import("@/lib/receipt/pdf-generator");
    const fakePdf = Buffer.from("fake-pdf");
    (generateReceiptPDF as ReturnType<typeof vi.fn>).mockResolvedValue(fakePdf);

    const res = await GET(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "v-1" }) }
    );

    expect(res.status).toBe(200);
    expect(generateReceiptPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        business: expect.objectContaining({ name: "AerisPay" }),
      })
    );
  });

  it("passes business info from parametres to generator", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParametres);

    const { generateReceiptPDF } = await import("@/lib/receipt/pdf-generator");
    (generateReceiptPDF as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("pdf"));

    await GET(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "v-1" }) }
    );

    expect(generateReceiptPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        business: {
          name: "Super Marche",
          address: "123 Rue du Commerce",
          phone: "+221 77 000 00 00",
          email: "contact@super.com",
          rccm: "SN-DKR-2024-B-12345",
          nif: "1234567890",
          logo: null,
        },
      })
    );
  });

  it("is accessible to all roles", async () => {
    for (const role of ["ADMIN", "MANAGER", "CAISSIER"] as Role[]) {
      vi.clearAllMocks();
      mockSession(role);
      (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);
      (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParametres);

      const { generateReceiptPDF } = await import("@/lib/receipt/pdf-generator");
      (generateReceiptPDF as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("pdf"));

      const res = await GET(
        new Request("http://localhost"),
        { params: Promise.resolve({ id: "v-1" }) }
      );
      expect(res.status).toBe(200);
    }
  });

  it("returns 500 on generator failure", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);
    (prisma.parametres.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParametres);

    const { generateReceiptPDF } = await import("@/lib/receipt/pdf-generator");
    (generateReceiptPDF as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("render failed"));

    const res = await GET(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(500);
  });
});
