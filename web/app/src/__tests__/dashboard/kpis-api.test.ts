import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { aggregate: vi.fn() },
    paiement: { aggregate: vi.fn() },
    caisseSession: { findFirst: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/receipt/thermal-printer", () => ({
  getPrinterConfig: vi.fn(),
  getCashDrawerConfig: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "Test", role },
  });
}

function mockAggregates() {
  (prisma.vente.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
    _sum: { total: new Decimal(50000) },
    _count: 5,
  });
  (prisma.paiement.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
    _sum: { montant: new Decimal(30000) },
  });
  (prisma.caisseSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "s-1",
    statut: "OUVERTE",
    ouvertureAt: new Date("2026-04-23T08:00:00Z"),
  });
}

describe("GET /api/dashboard/kpis", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/dashboard/kpis/route")).GET;

    const { getPrinterConfig, getCashDrawerConfig } = await import("@/lib/receipt/thermal-printer");
    (getPrinterConfig as ReturnType<typeof vi.fn>).mockReturnValue({ enabled: true, type: "EPSON", interface: "tcp://127.0.0.1:9100", width: 48 });
    (getCashDrawerConfig as ReturnType<typeof vi.fn>).mockReturnValue({ enabled: true, mode: "printer", pin: 2, openOnCash: true });
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/dashboard/kpis"));
    expect(res.status).toBe(401);
  });

  it("returns KPIs for CAISSIER with default period (day)", async () => {
    mockSession("CAISSIER");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveProperty("revenue");
    expect(body.data).toHaveProperty("salesCount");
    expect(body.data).toHaveProperty("averageBasket");
    expect(body.data).toHaveProperty("cashTotal");
    expect(body.data).toHaveProperty("nonCashTotal");
    expect(body.data).toHaveProperty("period");
    expect(body.data).toHaveProperty("peripherals");
  });

  it("returns KPIs for CAISSIER scoped to their sales only", async () => {
    mockSession("CAISSIER", "caissier-1");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis"));
    expect(res.status).toBe(200);

    // Check that the aggregate was called with userId filter
    expect(prisma.vente.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "caissier-1" }),
      })
    );
  });

  it("accepts period=week query parameter", async () => {
    mockSession("CAISSIER");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis?period=week"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.period).toBe("week");
  });

  it("accepts period=month query parameter", async () => {
    mockSession("CAISSIER");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis?period=month"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.period).toBe("month");
  });

  it("accepts custom dateFrom/dateTo", async () => {
    mockSession("CAISSIER");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis?dateFrom=2026-04-01&dateTo=2026-04-30"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.period).toBe("custom");
  });

  it("returns peripheral status", async () => {
    mockSession("CAISSIER");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis"));
    const body = await res.json();

    expect(body.data.peripherals).toHaveProperty("printer");
    expect(body.data.peripherals).toHaveProperty("cashDrawer");
    expect(body.data.peripherals.printer).toHaveProperty("enabled");
    expect(body.data.peripherals.cashDrawer).toHaveProperty("enabled");
  });

  it("ADMIN/MANAGER also get KPIs (not scoped to user)", async () => {
    mockSession("ADMIN");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis"));
    expect(res.status).toBe(200);

    // Should NOT filter by userId for ADMIN
    expect(prisma.vente.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ userId: expect.anything() }),
      })
    );
  });

  it("includes open session info for CAISSIER", async () => {
    mockSession("CAISSIER");
    mockAggregates();

    const res = await GET(new Request("http://localhost/api/dashboard/kpis"));
    const body = await res.json();

    expect(body.data).toHaveProperty("openSession");
    expect(body.data.openSession).toHaveProperty("id", "s-1");
  });
});
