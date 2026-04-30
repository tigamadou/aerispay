import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROUNDS = 12;

const SEED_USERS = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@aerispay.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@1234",
    nom: "Administrateur",
    role: Role.ADMIN,
  },
  {
    email: "gerant@aerispay.com",
    password: "Gerant@1234",
    nom: "Marie Diallo",
    role: Role.MANAGER,
  },
  {
    email: "caissier@aerispay.com",
    password: "Caissier@1234",
    nom: "Moussa Traoré",
    role: Role.CAISSIER,
  },
];

async function main() {
  for (const user of SEED_USERS) {
    const hash = await bcrypt.hash(user.password, ROUNDS);

    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        nom: user.nom,
        motDePasse: hash,
        role: user.role,
        actif: true,
      },
      update: {
        nom: user.nom,
        motDePasse: hash,
        role: user.role,
        actif: true,
      },
    });

    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  console.log(`\nSeed OK — ${SEED_USERS.length} comptes créés/mis à jour`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
