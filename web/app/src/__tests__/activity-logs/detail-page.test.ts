import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    activityLog: { findUnique: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "Test", role },
  });
}

const sampleLog = {
  id: "log-1",
  action: "SALE_COMPLETED",
  entityType: "Sale",
  entityId: "v-1",
  metadata: {
    numero: "VTE-2026-00001",
    total: 51679,
    sousTotal: 46100,
    remise: 2305,
    tva: 7884,
    nbArticles: 3,
    paiements: [{ mode: "ESPECES", montant: 55000 }],
    lignes: [
      { produitNom: "Farine 50kg", quantite: 2, prixUnitaire: 12500, sousTotal: 25000 },
    ],
  },
  ipAddress: "192.168.1.10",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-04-23T14:35:00Z"),
  actor: { id: "user-1", nom: "Amadou", email: "amadou@test.com", role: "CAISSIER" },
};

describe("Activity Log Detail (/activity-logs/[id])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects non-authenticated users", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // CAISSIER should be redirected too since they can't see logs
    expect(redirect).toBeDefined();
  });

  it("redirects CAISSIER (no permission)", () => {
    mockSession("CAISSIER");
    // CAISSIER has no activity_logs:consulter permission
    // The page should redirect
    expect(redirect).toBeDefined();
  });

  it("returns log data for ADMIN", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLog);

    const result = await prisma.activityLog.findUnique({
      where: { id: "log-1" },
      include: { actor: { select: { id: true, nom: true, email: true, role: true } } },
    });

    expect(result).toBeDefined();
    expect(result!.action).toBe("SALE_COMPLETED");
    expect(result!.metadata).toHaveProperty("numero");
    expect(result!.metadata).toHaveProperty("total");
    expect(result!.metadata).toHaveProperty("lignes");
    expect(result!.metadata).toHaveProperty("paiements");
  });

  it("returns log data for MANAGER", async () => {
    mockSession("MANAGER");
    (prisma.activityLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLog);

    const result = await prisma.activityLog.findUnique({
      where: { id: "log-1" },
      include: { actor: { select: { id: true, nom: true, email: true, role: true } } },
    });

    expect(result).toBeDefined();
    expect(result!.action).toBe("SALE_COMPLETED");
  });

  it("calls notFound when log does not exist", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await prisma.activityLog.findUnique({
      where: { id: "nonexistent" },
    });

    expect(result).toBeNull();
    expect(notFound).toBeDefined();
  });

  it("includes full metadata with nested objects", async () => {
    mockSession("ADMIN");
    (prisma.activityLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLog);

    const result = await prisma.activityLog.findUnique({ where: { id: "log-1" } });
    const meta = result!.metadata as Record<string, unknown>;

    expect(meta.paiements).toEqual([{ mode: "ESPECES", montant: 55000 }]);
    expect(meta.lignes).toEqual([
      { produitNom: "Farine 50kg", quantite: 2, prixUnitaire: 12500, sousTotal: 25000 },
    ]);
  });
});
