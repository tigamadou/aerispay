import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { findUnique: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: {
    TICKET_THERMAL_PRINT_REQUESTED: "TICKET_THERMAL_PRINT_REQUESTED",
    CASH_DRAWER_OPENED: "CASH_DRAWER_OPENED",
    CASH_DRAWER_OPEN_FAILED: "CASH_DRAWER_OPEN_FAILED",
  },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/receipt/thermal-printer", () => ({
  printReceipt: vi.fn(),
  openCashDrawer: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "T", role },
  });
}

describe("POST /api/tickets/[id]/print", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/tickets/[id]/print/route")).POST;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if vente not found", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: "v-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful print", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "v-1" });
    const { printReceipt } = await import("@/lib/receipt/thermal-printer");
    (printReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, message: "OK" });

    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("returns 503 on printer failure", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "v-1" });
    const { printReceipt } = await import("@/lib/receipt/thermal-printer");
    (printReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, message: "Offline" });

    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(503);
  });

  it("returns 500 on unexpected error", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB"));
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: "v-1" }) }
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/cash-drawer/open", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/cash-drawer/open/route")).POST;
  });

  it("returns 401 if not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(new Request("http://localhost", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful open", async () => {
    mockSession("CAISSIER");
    const { openCashDrawer } = await import("@/lib/receipt/thermal-printer");
    (openCashDrawer as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, message: "OK" });

    const res = await POST(new Request("http://localhost", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("returns 503 on drawer failure", async () => {
    mockSession("CAISSIER");
    const { openCashDrawer } = await import("@/lib/receipt/thermal-printer");
    (openCashDrawer as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, message: "Err" });

    const res = await POST(new Request("http://localhost", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("returns 500 on unexpected error", async () => {
    mockSession("CAISSIER");
    const { openCashDrawer } = await import("@/lib/receipt/thermal-printer");
    (openCashDrawer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("crash"));

    const res = await POST(new Request("http://localhost", { method: "POST" }));
    expect(res.status).toBe(500);
  });
});
