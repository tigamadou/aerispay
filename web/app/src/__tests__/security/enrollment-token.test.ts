import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    enrollmentToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { issueEnrollmentToken, consumeEnrollmentToken } from "@/lib/services/enrollment-token";
import { hashToken } from "@/lib/services/store-token";

const create = prisma.enrollmentToken.create as ReturnType<typeof vi.fn>;
const findUnique = prisma.enrollmentToken.findUnique as ReturnType<typeof vi.fn>;
const updateMany = prisma.enrollmentToken.updateMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("issueEnrollmentToken", () => {
  it("émet un token clair de 64 hex et ne persiste que le hash", async () => {
    create.mockImplementation(async ({ data }) => ({ id: "et-1", ...data }));
    const res = await issueEnrollmentToken({ caisseId: "c1", ttlMinutes: 60 });
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.id).toBe("et-1");
    expect(res.expiresAt).toBeInstanceOf(Date);
    const arg = create.mock.calls[0][0].data;
    expect(arg.tokenHash).toBe(hashToken(res.token));
    expect(arg.caisseId).toBe("c1");
  });
});

describe("consumeEnrollmentToken", () => {
  it("token valide non consommé non expiré → consommé (updateMany 1) + caisseId", async () => {
    const token = "a".repeat(64);
    findUnique.mockResolvedValue({
      id: "et-1", caisseId: "c1", consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    updateMany.mockResolvedValue({ count: 1 });
    const res = await consumeEnrollmentToken(token);
    expect(res).toEqual({ valid: true, caisseId: "c1", tokenId: "et-1" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "et-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("token inconnu → invalide", async () => {
    findUnique.mockResolvedValue(null);
    expect(await consumeEnrollmentToken("b".repeat(64))).toEqual({ valid: false, caisseId: null, tokenId: null });
  });

  it("token déjà consommé → invalide", async () => {
    findUnique.mockResolvedValue({ id: "et-1", caisseId: "c1", consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    expect((await consumeEnrollmentToken("a".repeat(64))).valid).toBe(false);
  });

  it("token expiré → invalide", async () => {
    findUnique.mockResolvedValue({ id: "et-1", caisseId: "c1", consumedAt: null, expiresAt: new Date(Date.now() - 1) });
    expect((await consumeEnrollmentToken("a".repeat(64))).valid).toBe(false);
  });

  it("course : updateMany count 0 (consommé entre-temps) → invalide", async () => {
    findUnique.mockResolvedValue({ id: "et-1", caisseId: "c1", consumedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    updateMany.mockResolvedValue({ count: 0 });
    expect((await consumeEnrollmentToken("a".repeat(64))).valid).toBe(false);
  });
});
