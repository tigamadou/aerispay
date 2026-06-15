import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedDefaultParametres } from "@/lib/seed/parametres";

function createMockPrisma() {
  return {
    parametres: { upsert: vi.fn().mockResolvedValue({}) },
    modePaiementConfig: { upsert: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

describe("seedDefaultParametres", () => {
  it("appelle upsert avec id 'default' et les données correctes", async () => {
    const mockPrisma = createMockPrisma();

    await seedDefaultParametres(mockPrisma);

    expect(mockPrisma.parametres.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      create: {
        id: "default",
        nomCommerce: "Super Marche AerisPay",
        adresse: "123 Avenue Cheikh Anta Diop, Dakar",
        telephone: "+221 77 000 00 00",
        email: "contact@aerispay.com",
        rccm: "SN-DKR-2024-B-12345",
        nif: "1234567890",
      },
      update: {},
    });
  });

  it("utilise un update vide (no-op si déjà existant)", async () => {
    const mockPrisma = createMockPrisma();

    await seedDefaultParametres(mockPrisma);

    const call = (mockPrisma.parametres.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.update).toEqual({});
  });

  it("cree les 4 modes de paiement par defaut", async () => {
    const mockPrisma = createMockPrisma();

    await seedDefaultParametres(mockPrisma);

    expect(mockPrisma.modePaiementConfig.upsert).toHaveBeenCalledTimes(4);

    const codes = (mockPrisma.modePaiementConfig.upsert as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: Array<{ where: { code: string } }>) => call[0].where.code,
    );
    expect(codes).toEqual(["ESPECES", "MOBILE_MONEY_MTN", "MOBILE_MONEY_MOOV", "CELTIS_CASH"]);
  });
});
