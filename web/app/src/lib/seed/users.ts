import type { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const ROUNDS = 12;

/** Compte admin cree en prod et en dev. Email/mot de passe configurables via env. */
const PROD_USERS = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@aerispay.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@1234",
    nom: "Administrateur",
    role: Role.ADMIN,
  },
];

/** Comptes supplementaires pour le developpement uniquement. */
const DEV_USERS = [
  {
    email: "gerant@aerispay.com",
    password: "Gerant@1234",
    nom: "Marie Diallo",
    role: Role.MANAGER,
  },
  {
    email: "caissier@aerispay.com",
    password: "Caissier@1234",
    nom: "Moussa Traore",
    role: Role.CAISSIER,
  },
];

async function upsertUsers(
  prisma: PrismaClient,
  users: typeof PROD_USERS,
): Promise<void> {
  for (const user of users) {
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

    console.log(`  > ${user.email} (${user.role})`);
  }
}

/** Seed le compte admin (prod). */
export async function seedProdUsers(prisma: PrismaClient): Promise<void> {
  await upsertUsers(prisma, PROD_USERS);
  console.log(`\nSeed OK — ${PROD_USERS.length} compte(s) admin cree(s)/mis a jour`);
}

/** Seed tous les comptes (admin + gerant + caissier) pour le dev. */
export async function seedDevUsers(prisma: PrismaClient): Promise<void> {
  const all = [...PROD_USERS, ...DEV_USERS];
  await upsertUsers(prisma, all);
  console.log(`\nSeed OK — ${all.length} comptes crees/mis a jour`);
}
