import { prisma } from "@/lib/db";
import { seedDefaultParametres } from "@/lib/seed/parametres";
import { seedDefaultCategories } from "@/lib/seed/categories";
import { seedDefaultCaisse } from "@/lib/seed/caisse";
import { seedProdUsers, seedDevUsers } from "@/lib/seed/users";
import { seedDevProduits } from "@/lib/seed/produits";

const isProd = process.env.NODE_ENV === "production";

async function main() {
  console.log(`\n=== Seed ${isProd ? "PRODUCTION" : "DEVELOPPEMENT"} ===\n`);

  // ─── Commun prod + dev ────────────────────────────

  // Users : admin seul en prod, tous en dev
  if (isProd) {
    await seedProdUsers(prisma);
  } else {
    await seedDevUsers(prisma);
  }

  // Categories de produits
  const categorieMap = await seedDefaultCategories(prisma);

  // Parametres de la structure + modes de paiement
  await seedDefaultParametres(prisma);
  console.log(`\nSeed OK — Parametres de la structure crees`);

  // Caisse par defaut + seuils
  await seedDefaultCaisse(prisma);

  // ─── Dev uniquement ───────────────────────────────

  if (!isProd) {
    await seedDevProduits(prisma, categorieMap);
  }

  console.log(`\n=== Seed termine ===\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
