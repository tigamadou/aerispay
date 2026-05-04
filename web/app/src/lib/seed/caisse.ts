import type { PrismaClient } from "@prisma/client";

const DEFAULT_SEUILS = [
  { id: "THRESHOLD_DISCREPANCY_MINOR", valeur: 500, description: "Ecart mineur tolere automatiquement (FCFA)" },
  { id: "THRESHOLD_DISCREPANCY_MEDIUM", valeur: 5000, description: "Ecart moyen necessitant acceptation explicite (FCFA)" },
  { id: "THRESHOLD_DISCREPANCY_MAJOR", valeur: 5000, description: "Ecart majeur declenchant une alerte (FCFA)" },
  { id: "THRESHOLD_RECURRING_COUNT", valeur: 3, description: "Nombre d'ecarts declenchant une alerte recurrence" },
  { id: "THRESHOLD_RECURRING_PERIOD_DAYS", valeur: 7, description: "Fenetre glissante en jours pour le comptage des ecarts recurrents" },
  { id: "THRESHOLD_CASH_WITHDRAWAL_AUTH", valeur: 10000, description: "Retrait sans autorisation manager (FCFA)" },
  { id: "THRESHOLD_EXPENSE_AUTH", valeur: 5000, description: "Depense sans autorisation manager (FCFA)" },
  { id: "THRESHOLD_MAX_RECOUNT_ATTEMPTS", valeur: 3, description: "Nombre max de recomptages avant contestation" },
  { id: "THRESHOLD_OFFLINE_READONLY_HOURS", valeur: 4, description: "Duree avant passage en lecture seule hors ligne (heures)" },
];

/** Seed la caisse par defaut et les seuils (prod + dev). */
export async function seedDefaultCaisse(prisma: PrismaClient): Promise<void> {
  const caisse = await prisma.caisse.upsert({
    where: { id: "caisse-principale" },
    create: { id: "caisse-principale", nom: "Caisse principale", active: true },
    update: { nom: "Caisse principale", active: true },
  });
  console.log(`  > Caisse: ${caisse.nom} (${caisse.id})`);
  console.log(`\nSeed OK — Caisse par defaut creee`);

  for (const seuil of DEFAULT_SEUILS) {
    await prisma.seuilCaisse.upsert({
      where: { id: seuil.id },
      create: seuil,
      update: { valeur: seuil.valeur, description: seuil.description },
    });
    console.log(`  > Seuil: ${seuil.id} = ${seuil.valeur}`);
  }

  console.log(`\nSeed OK — ${DEFAULT_SEUILS.length} seuils de caisse crees/mis a jour`);
}
