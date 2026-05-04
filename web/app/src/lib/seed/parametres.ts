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

  // Modes de paiement par defaut
  const defaultModes = [
    { code: "ESPECES", label: "Cash", ordre: 0 },
    { code: "MOBILE_MONEY_MTN", label: "MomoPay", ordre: 1 },
    { code: "MOBILE_MONEY_MOOV", label: "MoovMoney", ordre: 2 },
    { code: "CELTIS_CASH", label: "Celtis Cash", ordre: 3 },
  ];

  for (const mode of defaultModes) {
    await prisma.modePaiementConfig.upsert({
      where: { code: mode.code },
      create: {
        code: mode.code,
        label: mode.label,
        ordre: mode.ordre,
        active: true,
        parametresId: "default",
      },
      update: { label: mode.label, ordre: mode.ordre },
    });
  }
}
