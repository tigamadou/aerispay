import { describe, it, expect } from "vitest";
import { computeSessionHash } from "@/lib/services/integrity";

const baseInput = {
  sessionId: "s-1",
  userId: "u-1",
  ouvertureAt: "2026-04-30T08:00:00.000Z",
  validationAt: "2026-04-30T18:00:00.000Z",
  mouvements: [
    { id: "m-1", type: "FOND_INITIAL", montant: "50000", mode: "ESPECES", createdAt: "2026-04-30T08:00:01.000Z" },
    { id: "m-2", type: "VENTE", montant: "10000", mode: "ESPECES", createdAt: "2026-04-30T10:00:00.000Z" },
  ],
  declarationsCaissier: { ESPECES: 60000 },
  declarationsValideur: { ESPECES: 60000 },
  ecarts: { ESPECES: 0 },
  hashPrecedent: "",
};

describe("computeSessionHash", () => {
  it("produces a 64-char hex string (SHA-256)", () => {
    const hash = computeSessionHash(baseInput);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same input produces same hash", () => {
    const hash1 = computeSessionHash(baseInput);
    const hash2 = computeSessionHash(baseInput);
    expect(hash1).toBe(hash2);
  });

  it("changes when sessionId changes", () => {
    const h1 = computeSessionHash(baseInput);
    const h2 = computeSessionHash({ ...baseInput, sessionId: "s-2" });
    expect(h1).not.toBe(h2);
  });

  it("changes when a movement is added", () => {
    const h1 = computeSessionHash(baseInput);
    const h2 = computeSessionHash({
      ...baseInput,
      mouvements: [
        ...baseInput.mouvements,
        { id: "m-3", type: "APPORT", montant: "5000", mode: "ESPECES", createdAt: "2026-04-30T12:00:00.000Z" },
      ],
    });
    expect(h1).not.toBe(h2);
  });

  it("changes when declaration amounts change", () => {
    const h1 = computeSessionHash(baseInput);
    const h2 = computeSessionHash({
      ...baseInput,
      declarationsCaissier: { ESPECES: 59000 },
    });
    expect(h1).not.toBe(h2);
  });

  it("changes when previous session hash changes (chaining)", () => {
    const h1 = computeSessionHash(baseInput);
    const h2 = computeSessionHash({
      ...baseInput,
      hashPrecedent: "abc123",
    });
    expect(h1).not.toBe(h2);
  });

  it("handles null declarationsValideur (force-close)", () => {
    const hash = computeSessionHash({
      ...baseInput,
      declarationsValideur: null,
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("movement order is deterministic (sorted by createdAt)", () => {
    const reversed = computeSessionHash({
      ...baseInput,
      mouvements: [...baseInput.mouvements].reverse(),
    });
    const original = computeSessionHash(baseInput);
    expect(reversed).toBe(original);
  });
});
