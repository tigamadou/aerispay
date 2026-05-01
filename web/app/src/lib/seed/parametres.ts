import type { PrismaClient } from "@prisma/client";

/** Valeurs par défaut pour la ligne `parametres.id === "default"` (seed / reset). */
export async function seedDefaultParametres(prisma: PrismaClient): Promise<void> {
  await prisma.parametres.upsert({
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
}
