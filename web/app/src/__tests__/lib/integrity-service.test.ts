import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { computeHashForSession, verifySessionIntegrity, computeSessionHash } from "@/lib/services/integrity";

// ─── Fixtures ───────────────────────────────────────

const ouvertureAt = new Date("2026-01-01T08:00:00Z");
const fermetureAt = new Date("2026-01-01T18:00:00Z");
const createdAt = new Date("2026-01-01T09:00:00Z");

const fakeSession = {
  id: "s-1",
  userId: "u-1",
  ouvertureAt,
  declarationsCaissier: { ESPECES: 60000 },
  declarationsValideur: { ESPECES: 60000 },
  ecartsParMode: { ESPECES: { ecart: 0 } },
};

const fakeMovements = [
  { id: "m-1", type: "FOND_INITIAL", montant: 50000, mode: "ESPECES", createdAt },
];

// ─── Tests ──────────────────────────────────────────

describe("computeHashForSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("charge la session et les mouvements depuis la DB", async () => {
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const hash = await computeHashForSession("s-1", fermetureAt);

    expect(prisma.comptoirSession.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-1" } }),
    );
    expect(prisma.mouvementCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: "s-1" } }),
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("utilise le hash de la session précédente pour le chaînage", async () => {
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      hashIntegrite: "prev-hash-abc",
    });

    const hashWithPrev = await computeHashForSession("s-1", fermetureAt);

    // Reset and compute without previous
    vi.clearAllMocks();
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const hashWithoutPrev = await computeHashForSession("s-1", fermetureAt);

    expect(hashWithPrev).not.toBe(hashWithoutPrev);
  });

  it("gère la première session (pas de hash précédent)", async () => {
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const hash = await computeHashForSession("s-1", fermetureAt);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("gère les ecartsParMode null", async () => {
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeSession,
      ecartsParMode: null,
    });
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const hash = await computeHashForSession("s-1", fermetureAt);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("verifySessionIntegrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie valid:true quand les hashes correspondent", async () => {
    // Compute expected hash first
    const expectedHash = computeSessionHash({
      sessionId: "s-1",
      userId: "u-1",
      ouvertureAt: ouvertureAt.toISOString(),
      validationAt: fermetureAt.toISOString(),
      mouvements: fakeMovements.map((m) => ({
        id: m.id,
        type: m.type,
        montant: String(m.montant),
        mode: m.mode,
        createdAt: m.createdAt.toISOString(),
      })),
      declarationsCaissier: { ESPECES: 60000 },
      declarationsValideur: { ESPECES: 60000 },
      ecarts: { ESPECES: 0 },
      hashPrecedent: "",
    });

    // Mock findUniqueOrThrow for verifySessionIntegrity (first call: get hash + fermetureAt)
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ hashIntegrite: expectedHash, fermetureAt })
      .mockResolvedValueOnce(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await verifySessionIntegrity("s-1");
    expect(result.valid).toBe(true);
    expect(result.storedHash).toBe(expectedHash);
    expect(result.computedHash).toBe(expectedHash);
  });

  it("renvoie valid:false quand les hashes ne correspondent pas", async () => {
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ hashIntegrite: "wrong-hash", fermetureAt })
      .mockResolvedValueOnce(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await verifySessionIntegrity("s-1");
    expect(result.valid).toBe(false);
    expect(result.storedHash).toBe("wrong-hash");
    expect(result.computedHash).not.toBe("wrong-hash");
  });

  it("utilise la date courante si fermetureAt est null", async () => {
    (prisma.comptoirSession.findUniqueOrThrow as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ hashIntegrite: null, fermetureAt: null })
      .mockResolvedValueOnce(fakeSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeMovements);
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await verifySessionIntegrity("s-1");
    expect(result.valid).toBe(false);
    expect(result.storedHash).toBeNull();
    expect(result.computedHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
