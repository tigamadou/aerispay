import { prisma } from "@/lib/db";
import { hash } from "bcryptjs";
import { Role } from "@prisma/client";

const SEED_USERS = [
  { email: "admin@aerispay.com", nom: "Administrateur", password: "Admin@1234", role: Role.ADMIN },
  { email: "gerant@aerispay.com", nom: "Marie Diallo", password: "Gerant@1234", role: Role.MANAGER },
  { email: "caissier@aerispay.com", nom: "Moussa Traoré", password: "Caissier@1234", role: Role.CAISSIER },
];

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Interdit en production" }, { status: 403 });
  }

  const seedEmails = SEED_USERS.map((u) => u.email);

  await prisma.user.deleteMany({
    where: { email: { notIn: seedEmails } },
  });

  for (const user of SEED_USERS) {
    const hashed = await hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        nom: user.nom,
        motDePasse: hashed,
        role: user.role,
        actif: true,
      },
      update: {
        nom: user.nom,
        motDePasse: hashed,
        role: user.role,
        actif: true,
      },
    });
  }

  return Response.json({ data: { reset: true, users: seedEmails.length } });
}
