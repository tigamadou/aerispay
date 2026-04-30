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
    nom: "Moussa Traore",
    role: Role.CAISSIER,
  },
];

const SEED_CATEGORIES = [
  {
    nom: "Alimentaire",
    description: "Produits alimentaires de base",
    couleur: "#22c55e",
  },
  {
    nom: "Boissons",
    description: "Boissons et rafraichissements",
    couleur: "#3b82f6",
  },
  {
    nom: "Hygiene",
    description: "Produits d'hygiene et soins corporels",
    couleur: "#a855f7",
  },
  {
    nom: "Fournitures",
    description: "Fournitures de bureau et scolaires",
    couleur: "#f59e0b",
  },
  {
    nom: "Divers",
    description: "Articles divers et accessoires",
    couleur: "#6b7280",
  },
];

interface SeedProduit {
  reference: string;
  codeBarres: string | null;
  nom: string;
  description: string;
  prixAchat: number;
  prixVente: number;
  tva: number;
  unite: string;
  stockActuel: number;
  stockMinimum: number;
  stockMaximum: number | null;
  categorie: string; // nom de la categorie
}

const SEED_PRODUITS: SeedProduit[] = [
  // --- Alimentaire ---
  {
    reference: "ALM-001",
    codeBarres: "3800020417560",
    nom: "Riz brise 5kg",
    description: "Sac de riz brise 5 kilogrammes",
    prixAchat: 2200,
    prixVente: 2750,
    tva: 0,
    unite: "sac",
    stockActuel: 45,
    stockMinimum: 10,
    stockMaximum: 200,
    categorie: "Alimentaire",
  },
  {
    reference: "ALM-002",
    codeBarres: "3800020417577",
    nom: "Sucre en poudre 1kg",
    description: "Sachet de sucre en poudre 1 kilogramme",
    prixAchat: 600,
    prixVente: 750,
    tva: 0,
    unite: "sachet",
    stockActuel: 30,
    stockMinimum: 15,
    stockMaximum: 150,
    categorie: "Alimentaire",
  },
  {
    reference: "ALM-003",
    codeBarres: "3800020417584",
    nom: "Farine de ble 1kg",
    description: "Paquet de farine de ble 1 kilogramme",
    prixAchat: 500,
    prixVente: 650,
    tva: 0,
    unite: "paquet",
    stockActuel: 3,
    stockMinimum: 10,
    stockMaximum: 100,
    categorie: "Alimentaire",
  },
  {
    reference: "ALM-004",
    codeBarres: null,
    nom: "Huile vegetale 1L",
    description: "Bouteille d'huile vegetale 1 litre",
    prixAchat: 900,
    prixVente: 1150,
    tva: 0,
    unite: "bouteille",
    stockActuel: 22,
    stockMinimum: 8,
    stockMaximum: 80,
    categorie: "Alimentaire",
  },
  {
    reference: "ALM-005",
    codeBarres: null,
    nom: "Sel fin 500g",
    description: "Paquet de sel fin iode 500 grammes",
    prixAchat: 150,
    prixVente: 250,
    tva: 0,
    unite: "paquet",
    stockActuel: 0,
    stockMinimum: 10,
    stockMaximum: 100,
    categorie: "Alimentaire",
  },
  {
    reference: "ALM-006",
    codeBarres: "3800020417591",
    nom: "Pate d'arachide 500g",
    description: "Pot de pate d'arachide 500 grammes",
    prixAchat: 800,
    prixVente: 1000,
    tva: 0,
    unite: "pot",
    stockActuel: 18,
    stockMinimum: 5,
    stockMaximum: 60,
    categorie: "Alimentaire",
  },
  {
    reference: "ALM-007",
    codeBarres: null,
    nom: "Cube Maggi x100",
    description: "Boite de 100 cubes Maggi",
    prixAchat: 1500,
    prixVente: 2000,
    tva: 0,
    unite: "boite",
    stockActuel: 12,
    stockMinimum: 5,
    stockMaximum: 50,
    categorie: "Alimentaire",
  },
  // --- Boissons ---
  {
    reference: "BOS-001",
    codeBarres: "3800020417608",
    nom: "Eau minerale 1.5L",
    description: "Bouteille d'eau minerale 1,5 litre",
    prixAchat: 250,
    prixVente: 400,
    tva: 0,
    unite: "bouteille",
    stockActuel: 60,
    stockMinimum: 20,
    stockMaximum: 300,
    categorie: "Boissons",
  },
  {
    reference: "BOS-002",
    codeBarres: "3800020417615",
    nom: "Jus de bissap 33cl",
    description: "Bouteille de jus de bissap 33 centilitres",
    prixAchat: 200,
    prixVente: 350,
    tva: 0,
    unite: "bouteille",
    stockActuel: 4,
    stockMinimum: 10,
    stockMaximum: 120,
    categorie: "Boissons",
  },
  {
    reference: "BOS-003",
    codeBarres: null,
    nom: "Lait en poudre 400g",
    description: "Boite de lait en poudre 400 grammes",
    prixAchat: 2000,
    prixVente: 2500,
    tva: 0,
    unite: "boite",
    stockActuel: 15,
    stockMinimum: 5,
    stockMaximum: 40,
    categorie: "Boissons",
  },
  {
    reference: "BOS-004",
    codeBarres: null,
    nom: "The Lipton x25",
    description: "Boite de 25 sachets de the Lipton",
    prixAchat: 700,
    prixVente: 950,
    tva: 0,
    unite: "boite",
    stockActuel: 0,
    stockMinimum: 5,
    stockMaximum: 30,
    categorie: "Boissons",
  },
  // --- Hygiene ---
  {
    reference: "HYG-001",
    codeBarres: "3800020417622",
    nom: "Savon de Marseille 200g",
    description: "Pain de savon de Marseille 200 grammes",
    prixAchat: 300,
    prixVente: 500,
    tva: 0,
    unite: "piece",
    stockActuel: 35,
    stockMinimum: 10,
    stockMaximum: 100,
    categorie: "Hygiene",
  },
  {
    reference: "HYG-002",
    codeBarres: null,
    nom: "Dentifrice Signal 100ml",
    description: "Tube de dentifrice Signal 100 millilitres",
    prixAchat: 500,
    prixVente: 750,
    tva: 0,
    unite: "tube",
    stockActuel: 20,
    stockMinimum: 8,
    stockMaximum: 60,
    categorie: "Hygiene",
  },
  {
    reference: "HYG-003",
    codeBarres: "3800020417639",
    nom: "Lessive en poudre 1kg",
    description: "Sachet de lessive en poudre 1 kilogramme",
    prixAchat: 1200,
    prixVente: 1500,
    tva: 0,
    unite: "sachet",
    stockActuel: 2,
    stockMinimum: 5,
    stockMaximum: 40,
    categorie: "Hygiene",
  },
  {
    reference: "HYG-004",
    codeBarres: null,
    nom: "Eau de Javel 1L",
    description: "Bouteille d'eau de Javel 1 litre",
    prixAchat: 350,
    prixVente: 500,
    tva: 0,
    unite: "bouteille",
    stockActuel: 25,
    stockMinimum: 8,
    stockMaximum: 50,
    categorie: "Hygiene",
  },
  // --- Fournitures ---
  {
    reference: "FRN-001",
    codeBarres: "3800020417646",
    nom: "Cahier 200 pages",
    description: "Cahier grand format 200 pages",
    prixAchat: 400,
    prixVente: 600,
    tva: 0,
    unite: "piece",
    stockActuel: 50,
    stockMinimum: 15,
    stockMaximum: 200,
    categorie: "Fournitures",
  },
  {
    reference: "FRN-002",
    codeBarres: null,
    nom: "Stylo Bic bleu x10",
    description: "Lot de 10 stylos Bic bleus",
    prixAchat: 800,
    prixVente: 1200,
    tva: 0,
    unite: "lot",
    stockActuel: 0,
    stockMinimum: 5,
    stockMaximum: 50,
    categorie: "Fournitures",
  },
  // --- Divers ---
  {
    reference: "DIV-001",
    codeBarres: "3800020417653",
    nom: "Piles AA x4",
    description: "Lot de 4 piles alcalines AA",
    prixAchat: 500,
    prixVente: 800,
    tva: 0,
    unite: "lot",
    stockActuel: 10,
    stockMinimum: 5,
    stockMaximum: 30,
    categorie: "Divers",
  },
  {
    reference: "DIV-002",
    codeBarres: null,
    nom: "Sac plastique x50",
    description: "Paquet de 50 sacs plastiques",
    prixAchat: 200,
    prixVente: 350,
    tva: 0,
    unite: "paquet",
    stockActuel: 40,
    stockMinimum: 10,
    stockMaximum: 100,
    categorie: "Divers",
  },
];

async function main() {
  // --- Users ---
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

    console.log(`  > ${user.email} (${user.role})`);
  }

  console.log(`\nSeed OK — ${SEED_USERS.length} comptes crees/mis a jour`);

  // --- Categories ---
  const categorieMap = new Map<string, string>();

  for (const cat of SEED_CATEGORIES) {
    let categorie = await prisma.categorie.findFirst({ where: { nom: cat.nom } });
    if (categorie) {
      categorie = await prisma.categorie.update({
        where: { id: categorie.id },
        data: { description: cat.description, couleur: cat.couleur },
      });
    } else {
      categorie = await prisma.categorie.create({
        data: { nom: cat.nom, description: cat.description, couleur: cat.couleur },
      });
    }
    categorieMap.set(cat.nom, categorie.id);
    console.log(`  > Categorie: ${categorie.nom} (${categorie.couleur})`);
  }

  console.log(`\nSeed OK — ${SEED_CATEGORIES.length} categories creees/mises a jour`);

  // --- Produits ---
  for (const prod of SEED_PRODUITS) {
    const categorieId = categorieMap.get(prod.categorie);
    if (!categorieId) {
      console.error(`  ! Categorie introuvable pour ${prod.reference}: ${prod.categorie}`);
      continue;
    }

    const data = {
      nom: prod.nom,
      codeBarres: prod.codeBarres,
      description: prod.description,
      prixAchat: prod.prixAchat,
      prixVente: prod.prixVente,
      tva: prod.tva,
      unite: prod.unite,
      stockActuel: prod.stockActuel,
      stockMinimum: prod.stockMinimum,
      stockMaximum: prod.stockMaximum,
      actif: true,
      categorieId,
    };

    await prisma.produit.upsert({
      where: { reference: prod.reference },
      create: {
        reference: prod.reference,
        ...data,
      },
      update: data,
    });

    const status =
      prod.stockActuel === 0
        ? "[RUPTURE]"
        : prod.stockActuel <= prod.stockMinimum
          ? "[ALERTE]"
          : "";

    console.log(
      `  > ${prod.reference} — ${prod.nom} (${prod.prixVente} FCFA) ${status}`
    );
  }

  console.log(`\nSeed OK — ${SEED_PRODUITS.length} produits crees/mis a jour`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
