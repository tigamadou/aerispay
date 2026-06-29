/**
 * C2.3 — Health-check du nœud magasin.
 * Le client Electron interroge cet endpoint ; s'il échoue, il affiche un écran de
 * blocage (pas de mode dégradé, ADR-001). Endpoint public léger : statut + connectivité DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db";

describe("GET /api/health", () => {
  let GET: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    GET = (await import("@/app/api/health/route")).GET;
  });

  it("renvoie 200 + status ok quand la base répond", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ "1": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe(true);
  });

  it("renvoie 503 quand la base est injoignable", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unavailable");
    expect(body.db).toBe(false);
  });
});
