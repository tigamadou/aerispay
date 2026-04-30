import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROUNDS = 12;

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@aerispay.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@1234";

  const hash = await bcrypt.hash(adminPassword, ROUNDS);

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      nom: "Administrateur",
      motDePasse: hash,
      role: Role.ADMIN,
      actif: true,
    },
    update: {
      nom: "Administrateur",
      motDePasse: hash,
      role: Role.ADMIN,
      actif: true,
    },
  });

  console.log(`Seed OK — compte admin : ${adminEmail} (rôle ADMIN)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
