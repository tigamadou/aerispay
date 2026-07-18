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
  // Lot G (Modele 2) — float laisse dans le tiroir apres la levee de cloture, par mode.
  // 0 = remise a zero / refloat complet. Configurable par PDV (ex. FLOAT_ESPECES = 20000).
  { id: "FLOAT_ESPECES", valeur: 0, description: "Fond de caisse (float) laisse en especes apres la levee (FCFA)" },
  // F1.5 (RULE-FOND-005) — caissier solo : 0 = desactive. Si > 0, le caissier peut
  // auto-valider sa propre session tant que l'ecart final reste <= ce seuil (FCFA).
  { id: "THRESHOLD_SOLO_AUTO_VALIDATION", valeur: 0, description: "Plafond d'ecart pour l'auto-validation en mode caissier solo (FCFA, 0 = desactive)" },
];

/** Seed le terminal de caisse par defaut et les seuils (prod + dev). */
export async function seedDefaultTerminal(prisma: PrismaClient): Promise<void> {
  // Les id techniques restent inchanges (references par migrations et fixtures).
  const terminal = await prisma.terminalCaisse.upsert({
    where: { id: "caisse-principale" },
    create: { id: "caisse-principale", code: "P1", nom: "Terminal principal", active: true },
    update: { code: "P1", nom: "Terminal principal", active: true },
  });
  console.log(`  > Terminal: ${terminal.nom} (${terminal.id})`);

  // F1.1 — 2ème terminal pour le multi-poste
  const terminal2 = await prisma.terminalCaisse.upsert({
    where: { id: "caisse-2" },
    create: { id: "caisse-2", code: "P2", nom: "Terminal 2", active: true },
    update: { code: "P2", nom: "Terminal 2", active: true },
  });
  console.log(`  > Terminal: ${terminal2.nom} (${terminal2.id})`);
  console.log(`\nSeed OK — Terminaux de caisse par defaut crees`);

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
