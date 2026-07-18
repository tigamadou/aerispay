import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    seuilCaisse: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getSeuil, invalidateSeuilsCache } from "@/lib/services/seuils";

// ─── Tests ──────────────────────────────────────────

describe("seuils service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSeuilsCache();
  });

  it("renvoie la valeur par défaut quand la DB n'a pas d'override", async () => {
    (prisma.seuilCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const val = await getSeuil("THRESHOLD_DISCREPANCY_MINOR");
    expect(val).toBe(500);
  });

  it("renvoie la valeur DB quand elle override le défaut", async () => {
    (prisma.seuilCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "THRESHOLD_DISCREPANCY_MINOR", valeur: 1000 },
    ]);

    const val = await getSeuil("THRESHOLD_DISCREPANCY_MINOR");
    expect(val).toBe(1000);
  });

  it("lance une erreur pour un seuil inconnu", async () => {
    (prisma.seuilCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(getSeuil("SEUIL_INEXISTANT")).rejects.toThrow("Seuil inconnu: SEUIL_INEXISTANT");
  });

  it("utilise le cache au deuxième appel (DB pas rappelée)", async () => {
    (prisma.seuilCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getSeuil("THRESHOLD_DISCREPANCY_MINOR");
    await getSeuil("THRESHOLD_DISCREPANCY_MEDIUM");

    expect(prisma.seuilCaisse.findMany).toHaveBeenCalledTimes(1);
  });

  it("invalidateSeuilsCache force le rechargement", async () => {
    (prisma.seuilCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getSeuil("THRESHOLD_DISCREPANCY_MINOR");
    invalidateSeuilsCache();
    await getSeuil("THRESHOLD_DISCREPANCY_MINOR");

    expect(prisma.seuilCaisse.findMany).toHaveBeenCalledTimes(2);
  });

  it("le cache expire après le TTL", async () => {
    (prisma.seuilCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const originalNow = Date.now;
    let fakeNow = 1000000;
    Date.now = () => fakeNow;

    await getSeuil("THRESHOLD_DISCREPANCY_MINOR");

    // Avancer de 61 secondes (TTL = 60s)
    fakeNow += 61_000;
    await getSeuil("THRESHOLD_DISCREPANCY_MINOR");

    expect(prisma.seuilCaisse.findMany).toHaveBeenCalledTimes(2);

    Date.now = originalNow;
  });
});
