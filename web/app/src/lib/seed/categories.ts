import type { PrismaClient } from "@prisma/client";

const DEFAULT_CATEGORIES = [
  // --- Alimentaire - Frais ---
  { nom: "Boucherie", description: "Viandes fraiches et decoupees", couleur: "#dc2626" },
  { nom: "Charcuterie-Traiteur", description: "Charcuterie, traiteur et plats prepares", couleur: "#b91c1c" },
  { nom: "Poissonnerie", description: "Poissons frais et fruits de mer", couleur: "#0891b2" },
  { nom: "Produits laitiers", description: "Lait, yaourts, desserts frais et cremerie", couleur: "#f0f9ff" },
  { nom: "Fromagerie", description: "Fromages locaux et importes", couleur: "#fbbf24" },
  { nom: "Fruits et legumes", description: "Fruits, legumes frais et fraiche decoupe", couleur: "#22c55e" },
  { nom: "Boulangerie-Patisserie", description: "Pain, viennoiseries et patisseries", couleur: "#d97706" },
  { nom: "Surgeles", description: "Produits surgeles", couleur: "#7dd3fc" },

  // --- Epicerie ---
  { nom: "Conserves et sauces", description: "Conserves, huiles, condiments et sauces", couleur: "#ea580c" },
  { nom: "Produits secs", description: "Pates, riz, cereales, farines, sucre et legumineuses", couleur: "#a16207" },
  { nom: "Epicerie sucree", description: "Confiserie, biscuits, chocolat et aide a la patisserie", couleur: "#ec4899" },
  { nom: "Epicerie salee", description: "Gateaux sales, aperitifs et fruits secs", couleur: "#f97316" },
  { nom: "Produits bio et dietetiques", description: "Produits biologiques, dietetiques et de terroir", couleur: "#65a30d" },

  // --- Petit-dejeuner ---
  { nom: "Petit-dejeuner", description: "The, cafe, cereales, confitures, miel et pate a tartiner", couleur: "#92400e" },

  // --- Bebe ---
  { nom: "Bebe et puericulture", description: "Petits pots, couches, hygiene infantile et puericulture", couleur: "#f9a8d4" },

  // --- Boissons ---
  { nom: "Eaux et sodas", description: "Eaux minerales, sodas et jus de fruits", couleur: "#3b82f6" },
  { nom: "Boissons alcoolisees", description: "Vins, bieres et spiritueux", couleur: "#7c3aed" },

  // --- Droguerie et entretien ---
  { nom: "Produits menagers", description: "Lessive, nettoyants, balais, brosses et entretien maison", couleur: "#06b6d4" },

  // --- Hygiene et beaute ---
  { nom: "Hygiene et soins", description: "Toilette, soins du corps, sante dentaire, rasoirs et hygiene feminine", couleur: "#a855f7" },
  { nom: "Cosmetiques et parfumerie", description: "Cosmetiques, parfums, soins des cheveux et parapharmacie", couleur: "#e879f9" },

  // --- Non alimentaire ---
  { nom: "Textile et linge", description: "Vetements, chaussures, lingerie et linge de maison", couleur: "#64748b" },
  { nom: "Quincaillerie et bricolage", description: "Quincaillerie, bricolage et accessoires automobiles", couleur: "#78716c" },
  { nom: "Electromenager", description: "Petit et gros electromenager", couleur: "#475569" },
  { nom: "Jouets et loisirs", description: "Jouets, jeux, jardinage et loisirs", couleur: "#f43f5e" },
  { nom: "Papeterie et fournitures", description: "Papeterie, fournitures de bureau et scolaires, librairie", couleur: "#f59e0b" },
  { nom: "Decoration et vaisselle", description: "Decoration, vaisselle et arts de la table", couleur: "#8b5cf6" },
  { nom: "Bagagerie", description: "Sacs, valises et bagagerie", couleur: "#0d9488" },
  { nom: "Alimentation animale", description: "Nourriture et accessoires pour animaux", couleur: "#84cc16" },

  // --- Divers ---
  { nom: "Divers", description: "Articles divers et accessoires non classes", couleur: "#6b7280" },
];

/**
 * Seed les categories de produits par defaut.
 * Retourne une Map<nom, id> pour lier les produits aux categories.
 */
export async function seedDefaultCategories(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const categorieMap = new Map<string, string>();

  for (const cat of DEFAULT_CATEGORIES) {
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

  console.log(`\nSeed OK — ${DEFAULT_CATEGORIES.length} categories creees/mises a jour`);

  return categorieMap;
}
