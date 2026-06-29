/**
 * E3.2 — Tokens de magasin scopés par poste + révocation (logique nœud).
 * Le nœud émet un token scoppé à une caisse (poste), le vérifie (actif + scope),
 * et peut le révoquer (perte/vol de poste). Le token n'est jamais stocké en clair
 * (seul son hash SHA-256 est persisté) — cohérent avec la règle "ne jamais journaliser
 * de secrets". Le stockage trousseau OS et le transport HTTPS/mTLS restent côté Electron.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    storeToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { issueStoreToken, verifyStoreToken, revokeStoreToken, hashToken } from "@/lib/services/store-token";

describe("E3.2 — store-token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("émet un token scoppé à une caisse et persiste son hash (jamais le clair)", async () => {
    let created: Record<string, unknown> | undefined;
    (prisma.storeToken.create as ReturnType<typeof vi.fn>).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      created = data;
      return { id: "tok-1", ...data };
    });

    const { token, id } = await issueStoreToken({ terminalId: "caisse-1", label: "Poste 1" });

    expect(token).toMatch(/^[a-f0-9]{64}$/); // secret aléatoire en hex
    expect(id).toBe("tok-1");
    expect(created?.terminalId).toBe("caisse-1");
    // Le clair n'est jamais persisté : seul le hash l'est
    expect(created?.tokenHash).toBe(hashToken(token));
    expect(Object.values(created ?? {})).not.toContain(token);
  });

  it("vérifie un token actif et renvoie le scope caisse", async () => {
    const token = "a".repeat(64);
    (prisma.storeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tok-1", tokenHash: hashToken(token), terminalId: "caisse-1", revoked: false,
    });

    const result = await verifyStoreToken(token);
    expect(result.valid).toBe(true);
    expect(result.terminalId).toBe("caisse-1");
    expect(prisma.storeToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken(token) } });
  });

  it("rejette un token révoqué", async () => {
    const token = "b".repeat(64);
    (prisma.storeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tok-1", tokenHash: hashToken(token), terminalId: "caisse-1", revoked: true,
    });

    const result = await verifyStoreToken(token);
    expect(result.valid).toBe(false);
    expect(result.terminalId).toBeNull();
  });

  it("rejette un token inconnu", async () => {
    (prisma.storeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await verifyStoreToken("c".repeat(64));
    expect(result.valid).toBe(false);
  });

  it("révoque un token (perte/vol de poste)", async () => {
    (prisma.storeToken.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "tok-1", revoked: true });
    await revokeStoreToken("tok-1");
    expect(prisma.storeToken.update).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: { revoked: true },
    });
  });

  it("hashToken est déterministe et non réversible (SHA-256 hex)", () => {
    const h1 = hashToken("secret");
    const h2 = hashToken("secret");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(h1).not.toContain("secret");
  });
});
