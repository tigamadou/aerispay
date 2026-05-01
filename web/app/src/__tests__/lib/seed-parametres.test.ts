import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedDefaultParametres } from "@/lib/seed/parametres";

describe("seedDefaultParametres", () => {
  it("appelle upsert avec id 'default' et les données correctes", async () => {
    const mockPrisma = {
      parametres: { upsert: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;

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
    const mockPrisma = {
      parametres: { upsert: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;

    await seedDefaultParametres(mockPrisma);

    const call = (mockPrisma.parametres.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.update).toEqual({});
  });
});
