/**
 * S4.3 — Worker pull référence (cloud → magasin, LWW) + S4.4 résilience.
 * Tire les mises à jour de référence depuis un curseur, les applique via un applier
 * injectable, avance le curseur. En cas d'échec, le curseur n'avance pas (rejeu).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { pullReferenceUpdates, withRetry } from "@/lib/services/cloud-sync";
import type { CloudSyncTransport, ReferenceUpdate } from "@/lib/services/cloud-sync";

describe("S4.3 — pullReferenceUpdates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applique les mises à jour reçues et avance le curseur", async () => {
    const updates: ReferenceUpdate[] = [
      { entity: "produit", data: { id: "p-1", prixVente: 1500 } },
      { entity: "taxe", data: { id: "t-1", taux: 18 } },
    ];
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn(),
      pullReference: vi.fn().mockResolvedValue({ updates, nextCursor: "cursor-2" }),
    };
    const apply = vi.fn().mockResolvedValue(undefined);

    const result = await pullReferenceUpdates(transport, { cursor: "cursor-1", apply });

    expect(transport.pullReference).toHaveBeenCalledWith("cursor-1");
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(updates[0]);
    expect(result.applied).toBe(2);
    expect(result.nextCursor).toBe("cursor-2");
  });

  it("conserve le curseur courant si aucune mise à jour", async () => {
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn(),
      pullReference: vi.fn().mockResolvedValue({ updates: [], nextCursor: null }),
    };
    const apply = vi.fn();

    const result = await pullReferenceUpdates(transport, { cursor: "cursor-1", apply });

    expect(apply).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.nextCursor).toBe("cursor-1");
  });

  it("ne fait pas avancer le curseur si l'application échoue (rejeu)", async () => {
    const transport: CloudSyncTransport = {
      pushEvents: vi.fn(),
      pullReference: vi.fn().mockResolvedValue({
        updates: [{ entity: "produit", data: {} }],
        nextCursor: "cursor-2",
      }),
    };
    const apply = vi.fn().mockRejectedValue(new Error("apply failed"));

    const result = await pullReferenceUpdates(transport, { cursor: "cursor-1", apply });

    expect(result.failed).toBe(true);
    expect(result.nextCursor).toBe("cursor-1");
  });
});

describe("S4.4 — withRetry (résilience WAN)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("réussit sans réessai si la première tentative passe", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const res = await withRetry(fn, { retries: 3 });
    expect(res).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("réessaie jusqu'à réussir", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("WAN"))
      .mockRejectedValueOnce(new Error("WAN"))
      .mockResolvedValue("ok");
    const res = await withRetry(fn, { retries: 3 });
    expect(res).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("propage l'erreur après épuisement des tentatives", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("WAN down"));
    await expect(withRetry(fn, { retries: 2 })).rejects.toThrow("WAN down");
    expect(fn).toHaveBeenCalledTimes(3); // 1 tentative + 2 réessais
  });
});
