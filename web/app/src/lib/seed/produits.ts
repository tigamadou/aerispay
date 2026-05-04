import type { PrismaClient } from "@prisma/client";

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
  categorie: string;
}

/** 200 produits de demonstration couvrant toutes les categories. */
const DEV_PRODUITS: SeedProduit[] = [
  // ─── Boucherie (8) ────────────────────────────────
  { reference: "BOU-001", codeBarres: "3800030000001", nom: "Poulet entier 1.5kg", description: "Poulet entier frais 1,5 kg", prixAchat: 2500, prixVente: 3500, tva: 0, unite: "piece", stockActuel: 20, stockMinimum: 5, stockMaximum: 50, categorie: "Boucherie" },
  { reference: "BOU-002", codeBarres: null, nom: "Viande de boeuf 1kg", description: "Viande de boeuf decoupe 1 kg", prixAchat: 4000, prixVente: 5500, tva: 0, unite: "kg", stockActuel: 10, stockMinimum: 3, stockMaximum: 30, categorie: "Boucherie" },
  { reference: "BOU-003", codeBarres: null, nom: "Cotes d'agneau 500g", description: "Cotes d'agneau fraiches 500 g", prixAchat: 3500, prixVente: 4800, tva: 0, unite: "barquette", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Boucherie" },
  { reference: "BOU-004", codeBarres: null, nom: "Foie de boeuf 500g", description: "Foie de boeuf frais 500 g", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "barquette", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Boucherie" },
  { reference: "BOU-005", codeBarres: null, nom: "Cuisses de poulet x6", description: "Lot de 6 cuisses de poulet", prixAchat: 2000, prixVente: 2800, tva: 0, unite: "lot", stockActuel: 15, stockMinimum: 5, stockMaximum: 40, categorie: "Boucherie" },
  { reference: "BOU-006", codeBarres: null, nom: "Viande hachee 500g", description: "Viande hachee de boeuf 500 g", prixAchat: 2200, prixVente: 3000, tva: 0, unite: "barquette", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Boucherie" },
  { reference: "BOU-007", codeBarres: null, nom: "Tripes de boeuf 1kg", description: "Tripes de boeuf nettoyees 1 kg", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "kg", stockActuel: 5, stockMinimum: 2, stockMaximum: 15, categorie: "Boucherie" },
  { reference: "BOU-008", codeBarres: null, nom: "Pattes de poulet 1kg", description: "Pattes de poulet 1 kg", prixAchat: 500, prixVente: 800, tva: 0, unite: "kg", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Boucherie" },

  // ─── Charcuterie-Traiteur (5) ─────────────────────
  { reference: "CHT-001", codeBarres: null, nom: "Saucisson de poulet 250g", description: "Saucisson de poulet 250 g", prixAchat: 800, prixVente: 1200, tva: 0, unite: "piece", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Charcuterie-Traiteur" },
  { reference: "CHT-002", codeBarres: null, nom: "Merguez x10", description: "Lot de 10 merguez", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "lot", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Charcuterie-Traiteur" },
  { reference: "CHT-003", codeBarres: null, nom: "Pate en croute", description: "Pate en croute portion individuelle", prixAchat: 600, prixVente: 900, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 15, categorie: "Charcuterie-Traiteur" },
  { reference: "CHT-004", codeBarres: null, nom: "Samossa viande x6", description: "Lot de 6 samossas a la viande", prixAchat: 1000, prixVente: 1500, tva: 0, unite: "lot", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Charcuterie-Traiteur" },
  { reference: "CHT-005", codeBarres: null, nom: "Nem poulet x8", description: "Lot de 8 nems au poulet", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "lot", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Charcuterie-Traiteur" },

  // ─── Poissonnerie (7) ─────────────────────────────
  { reference: "POI-001", codeBarres: null, nom: "Tilapia frais 1kg", description: "Tilapia frais entier 1 kg", prixAchat: 2000, prixVente: 3000, tva: 0, unite: "kg", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Poissonnerie" },
  { reference: "POI-002", codeBarres: null, nom: "Capitaine 1kg", description: "Poisson capitaine frais 1 kg", prixAchat: 3500, prixVente: 5000, tva: 0, unite: "kg", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Poissonnerie" },
  { reference: "POI-003", codeBarres: null, nom: "Crevettes fraiches 500g", description: "Crevettes fraiches 500 g", prixAchat: 4000, prixVente: 5500, tva: 0, unite: "barquette", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Poissonnerie" },
  { reference: "POI-004", codeBarres: null, nom: "Maquereau fume 500g", description: "Maquereau fume 500 g", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "piece", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Poissonnerie" },
  { reference: "POI-005", codeBarres: null, nom: "Sardines fraiches 1kg", description: "Sardines fraiches 1 kg", prixAchat: 1000, prixVente: 1500, tva: 0, unite: "kg", stockActuel: 20, stockMinimum: 5, stockMaximum: 40, categorie: "Poissonnerie" },
  { reference: "POI-006", codeBarres: null, nom: "Poisson seche 500g", description: "Poisson seche traditionnel 500 g", prixAchat: 2500, prixVente: 3500, tva: 0, unite: "sachet", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Poissonnerie" },
  { reference: "POI-007", codeBarres: null, nom: "Carpe 1kg", description: "Carpe fraiche 1 kg", prixAchat: 1800, prixVente: 2600, tva: 0, unite: "kg", stockActuel: 7, stockMinimum: 2, stockMaximum: 15, categorie: "Poissonnerie" },

  // ─── Produits laitiers (8) ────────────────────────
  { reference: "LAI-001", codeBarres: "3800030000101", nom: "Lait en poudre 400g", description: "Boite de lait en poudre 400 g", prixAchat: 2000, prixVente: 2500, tva: 0, unite: "boite", stockActuel: 15, stockMinimum: 5, stockMaximum: 40, categorie: "Produits laitiers" },
  { reference: "LAI-002", codeBarres: null, nom: "Lait concentre sucre 400g", description: "Boite de lait concentre sucre 400 g", prixAchat: 800, prixVente: 1100, tva: 0, unite: "boite", stockActuel: 30, stockMinimum: 10, stockMaximum: 80, categorie: "Produits laitiers" },
  { reference: "LAI-003", codeBarres: null, nom: "Yaourt nature x4", description: "Pack de 4 yaourts nature", prixAchat: 600, prixVente: 900, tva: 0, unite: "pack", stockActuel: 20, stockMinimum: 8, stockMaximum: 50, categorie: "Produits laitiers" },
  { reference: "LAI-004", codeBarres: null, nom: "Beurre 250g", description: "Plaquette de beurre 250 g", prixAchat: 1200, prixVente: 1600, tva: 0, unite: "plaquette", stockActuel: 10, stockMinimum: 4, stockMaximum: 25, categorie: "Produits laitiers" },
  { reference: "LAI-005", codeBarres: null, nom: "Fromage fondu x8", description: "Boite de 8 portions de fromage fondu", prixAchat: 900, prixVente: 1300, tva: 0, unite: "boite", stockActuel: 12, stockMinimum: 4, stockMaximum: 30, categorie: "Produits laitiers" },
  { reference: "LAI-006", codeBarres: null, nom: "Creme fraiche 20cl", description: "Pot de creme fraiche 20 cl", prixAchat: 500, prixVente: 750, tva: 0, unite: "pot", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Produits laitiers" },
  { reference: "LAI-007", codeBarres: null, nom: "Lait UHT 1L", description: "Brique de lait UHT 1 litre", prixAchat: 700, prixVente: 1000, tva: 0, unite: "brique", stockActuel: 25, stockMinimum: 10, stockMaximum: 60, categorie: "Produits laitiers" },
  { reference: "LAI-008", codeBarres: null, nom: "Yaourt a boire 50cl", description: "Bouteille de yaourt a boire 50 cl", prixAchat: 400, prixVente: 600, tva: 0, unite: "bouteille", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Produits laitiers" },

  // ─── Fromagerie (4) ───────────────────────────────
  { reference: "FRO-001", codeBarres: null, nom: "Fromage de chevre 200g", description: "Fromage de chevre frais 200 g", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "piece", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Fromagerie" },
  { reference: "FRO-002", codeBarres: null, nom: "Emmental rape 150g", description: "Sachet d'emmental rape 150 g", prixAchat: 800, prixVente: 1200, tva: 0, unite: "sachet", stockActuel: 10, stockMinimum: 4, stockMaximum: 25, categorie: "Fromagerie" },
  { reference: "FRO-003", codeBarres: null, nom: "Mozzarella 125g", description: "Boule de mozzarella 125 g", prixAchat: 700, prixVente: 1000, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Fromagerie" },
  { reference: "FRO-004", codeBarres: null, nom: "Parmesan rape 80g", description: "Sachet de parmesan rape 80 g", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "sachet", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Fromagerie" },

  // ─── Fruits et legumes (10) ───────────────────────
  { reference: "FRL-001", codeBarres: null, nom: "Oignons 1kg", description: "Oignons frais 1 kg", prixAchat: 300, prixVente: 500, tva: 0, unite: "kg", stockActuel: 50, stockMinimum: 15, stockMaximum: 100, categorie: "Fruits et legumes" },
  { reference: "FRL-002", codeBarres: null, nom: "Tomates fraiches 1kg", description: "Tomates fraiches 1 kg", prixAchat: 400, prixVente: 650, tva: 0, unite: "kg", stockActuel: 40, stockMinimum: 10, stockMaximum: 80, categorie: "Fruits et legumes" },
  { reference: "FRL-003", codeBarres: null, nom: "Piment frais 250g", description: "Piment frais 250 g", prixAchat: 200, prixVente: 350, tva: 0, unite: "sachet", stockActuel: 25, stockMinimum: 8, stockMaximum: 50, categorie: "Fruits et legumes" },
  { reference: "FRL-004", codeBarres: null, nom: "Bananes plantain 1kg", description: "Bananes plantain 1 kg", prixAchat: 500, prixVente: 750, tva: 0, unite: "kg", stockActuel: 30, stockMinimum: 10, stockMaximum: 60, categorie: "Fruits et legumes" },
  { reference: "FRL-005", codeBarres: null, nom: "Mangue x3", description: "Lot de 3 mangues fraiches", prixAchat: 600, prixVente: 900, tva: 0, unite: "lot", stockActuel: 20, stockMinimum: 5, stockMaximum: 40, categorie: "Fruits et legumes" },
  { reference: "FRL-006", codeBarres: null, nom: "Gombo frais 500g", description: "Gombo frais 500 g", prixAchat: 300, prixVente: 500, tva: 0, unite: "sachet", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Fruits et legumes" },
  { reference: "FRL-007", codeBarres: null, nom: "Aubergine x4", description: "Lot de 4 aubergines", prixAchat: 400, prixVente: 600, tva: 0, unite: "lot", stockActuel: 18, stockMinimum: 5, stockMaximum: 35, categorie: "Fruits et legumes" },
  { reference: "FRL-008", codeBarres: null, nom: "Pommes de terre 5kg", description: "Sac de pommes de terre 5 kg", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "sac", stockActuel: 12, stockMinimum: 4, stockMaximum: 30, categorie: "Fruits et legumes" },
  { reference: "FRL-009", codeBarres: null, nom: "Citrons x6", description: "Filet de 6 citrons", prixAchat: 250, prixVente: 400, tva: 0, unite: "filet", stockActuel: 22, stockMinimum: 8, stockMaximum: 50, categorie: "Fruits et legumes" },
  { reference: "FRL-010", codeBarres: null, nom: "Ail 200g", description: "Ail frais 200 g", prixAchat: 300, prixVente: 500, tva: 0, unite: "sachet", stockActuel: 20, stockMinimum: 6, stockMaximum: 40, categorie: "Fruits et legumes" },

  // ─── Boulangerie-Patisserie (6) ───────────────────
  { reference: "BPT-001", codeBarres: null, nom: "Baguette de pain", description: "Baguette de pain tradition", prixAchat: 100, prixVente: 150, tva: 0, unite: "piece", stockActuel: 80, stockMinimum: 20, stockMaximum: 200, categorie: "Boulangerie-Patisserie" },
  { reference: "BPT-002", codeBarres: null, nom: "Pain de mie 500g", description: "Pain de mie tranche 500 g", prixAchat: 500, prixVente: 750, tva: 0, unite: "sachet", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Boulangerie-Patisserie" },
  { reference: "BPT-003", codeBarres: null, nom: "Croissant x4", description: "Lot de 4 croissants", prixAchat: 600, prixVente: 900, tva: 0, unite: "lot", stockActuel: 10, stockMinimum: 4, stockMaximum: 20, categorie: "Boulangerie-Patisserie" },
  { reference: "BPT-004", codeBarres: null, nom: "Gateau au chocolat", description: "Gateau au chocolat portion", prixAchat: 800, prixVente: 1200, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 15, categorie: "Boulangerie-Patisserie" },
  { reference: "BPT-005", codeBarres: null, nom: "Beignets x10", description: "Lot de 10 beignets sucres", prixAchat: 500, prixVente: 800, tva: 0, unite: "lot", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Boulangerie-Patisserie" },
  { reference: "BPT-006", codeBarres: null, nom: "Fataya x6", description: "Lot de 6 fatayas", prixAchat: 600, prixVente: 1000, tva: 0, unite: "lot", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Boulangerie-Patisserie" },

  // ─── Surgeles (6) ─────────────────────────────────
  { reference: "SUR-001", codeBarres: null, nom: "Poisson pane x10", description: "Lot de 10 poissons panes surgeles", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "boite", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Surgeles" },
  { reference: "SUR-002", codeBarres: null, nom: "Frites surgelees 1kg", description: "Sachet de frites surgelees 1 kg", prixAchat: 1000, prixVente: 1500, tva: 0, unite: "sachet", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Surgeles" },
  { reference: "SUR-003", codeBarres: null, nom: "Glace vanille 500ml", description: "Pot de glace vanille 500 ml", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "pot", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Surgeles" },
  { reference: "SUR-004", codeBarres: null, nom: "Legumes melanges 1kg", description: "Melange de legumes surgeles 1 kg", prixAchat: 800, prixVente: 1200, tva: 0, unite: "sachet", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Surgeles" },
  { reference: "SUR-005", codeBarres: null, nom: "Nuggets poulet x20", description: "Lot de 20 nuggets de poulet surgeles", prixAchat: 1800, prixVente: 2500, tva: 0, unite: "boite", stockActuel: 7, stockMinimum: 2, stockMaximum: 15, categorie: "Surgeles" },
  { reference: "SUR-006", codeBarres: null, nom: "Pizza margherita 400g", description: "Pizza margherita surgelee 400 g", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "boite", stockActuel: 6, stockMinimum: 2, stockMaximum: 12, categorie: "Surgeles" },

  // ─── Conserves et sauces (10) ─────────────────────
  { reference: "CON-001", codeBarres: "3800030000201", nom: "Huile vegetale 1L", description: "Bouteille d'huile vegetale 1 litre", prixAchat: 900, prixVente: 1150, tva: 0, unite: "bouteille", stockActuel: 22, stockMinimum: 8, stockMaximum: 80, categorie: "Conserves et sauces" },
  { reference: "CON-002", codeBarres: "3800030000202", nom: "Pate d'arachide 500g", description: "Pot de pate d'arachide 500 g", prixAchat: 800, prixVente: 1000, tva: 0, unite: "pot", stockActuel: 18, stockMinimum: 5, stockMaximum: 60, categorie: "Conserves et sauces" },
  { reference: "CON-003", codeBarres: null, nom: "Concentre de tomate 400g", description: "Boite de concentre de tomate 400 g", prixAchat: 500, prixVente: 750, tva: 0, unite: "boite", stockActuel: 35, stockMinimum: 10, stockMaximum: 80, categorie: "Conserves et sauces" },
  { reference: "CON-004", codeBarres: null, nom: "Sardines en conserve 125g", description: "Boite de sardines a l'huile 125 g", prixAchat: 400, prixVente: 600, tva: 0, unite: "boite", stockActuel: 40, stockMinimum: 15, stockMaximum: 100, categorie: "Conserves et sauces" },
  { reference: "CON-005", codeBarres: null, nom: "Thon en conserve 200g", description: "Boite de thon en conserve 200 g", prixAchat: 700, prixVente: 1000, tva: 0, unite: "boite", stockActuel: 25, stockMinimum: 8, stockMaximum: 60, categorie: "Conserves et sauces" },
  { reference: "CON-006", codeBarres: null, nom: "Huile d'arachide 1L", description: "Bouteille d'huile d'arachide 1 litre", prixAchat: 1200, prixVente: 1600, tva: 0, unite: "bouteille", stockActuel: 15, stockMinimum: 5, stockMaximum: 40, categorie: "Conserves et sauces" },
  { reference: "CON-007", codeBarres: null, nom: "Vinaigre 50cl", description: "Bouteille de vinaigre 50 cl", prixAchat: 300, prixVente: 500, tva: 0, unite: "bouteille", stockActuel: 20, stockMinimum: 6, stockMaximum: 40, categorie: "Conserves et sauces" },
  { reference: "CON-008", codeBarres: null, nom: "Mayonnaise 250g", description: "Pot de mayonnaise 250 g", prixAchat: 500, prixVente: 750, tva: 0, unite: "pot", stockActuel: 12, stockMinimum: 4, stockMaximum: 30, categorie: "Conserves et sauces" },
  { reference: "CON-009", codeBarres: null, nom: "Moutarde 200g", description: "Pot de moutarde 200 g", prixAchat: 400, prixVente: 600, tva: 0, unite: "pot", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Conserves et sauces" },
  { reference: "CON-010", codeBarres: null, nom: "Sauce pimentee 250ml", description: "Bouteille de sauce pimentee 250 ml", prixAchat: 350, prixVente: 550, tva: 0, unite: "bouteille", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Conserves et sauces" },

  // ─── Produits secs (12) ───────────────────────────
  { reference: "SEC-001", codeBarres: "3800030000301", nom: "Riz brise 5kg", description: "Sac de riz brise 5 kg", prixAchat: 2200, prixVente: 2750, tva: 0, unite: "sac", stockActuel: 45, stockMinimum: 10, stockMaximum: 200, categorie: "Produits secs" },
  { reference: "SEC-002", codeBarres: "3800030000302", nom: "Sucre en poudre 1kg", description: "Sachet de sucre en poudre 1 kg", prixAchat: 600, prixVente: 750, tva: 0, unite: "sachet", stockActuel: 30, stockMinimum: 15, stockMaximum: 150, categorie: "Produits secs" },
  { reference: "SEC-003", codeBarres: "3800030000303", nom: "Farine de ble 1kg", description: "Paquet de farine de ble 1 kg", prixAchat: 500, prixVente: 650, tva: 0, unite: "paquet", stockActuel: 3, stockMinimum: 10, stockMaximum: 100, categorie: "Produits secs" },
  { reference: "SEC-004", codeBarres: null, nom: "Sel fin 500g", description: "Paquet de sel fin iode 500 g", prixAchat: 150, prixVente: 250, tva: 0, unite: "paquet", stockActuel: 0, stockMinimum: 10, stockMaximum: 100, categorie: "Produits secs" },
  { reference: "SEC-005", codeBarres: null, nom: "Cube Maggi x100", description: "Boite de 100 cubes Maggi", prixAchat: 1500, prixVente: 2000, tva: 0, unite: "boite", stockActuel: 12, stockMinimum: 5, stockMaximum: 50, categorie: "Produits secs" },
  { reference: "SEC-006", codeBarres: null, nom: "Pates spaghetti 500g", description: "Paquet de spaghetti 500 g", prixAchat: 300, prixVente: 450, tva: 0, unite: "paquet", stockActuel: 40, stockMinimum: 15, stockMaximum: 100, categorie: "Produits secs" },
  { reference: "SEC-007", codeBarres: null, nom: "Couscous 1kg", description: "Paquet de couscous 1 kg", prixAchat: 500, prixVente: 700, tva: 0, unite: "paquet", stockActuel: 25, stockMinimum: 8, stockMaximum: 60, categorie: "Produits secs" },
  { reference: "SEC-008", codeBarres: null, nom: "Lentilles 500g", description: "Sachet de lentilles 500 g", prixAchat: 400, prixVente: 600, tva: 0, unite: "sachet", stockActuel: 20, stockMinimum: 6, stockMaximum: 40, categorie: "Produits secs" },
  { reference: "SEC-009", codeBarres: null, nom: "Haricots blancs 500g", description: "Sachet de haricots blancs 500 g", prixAchat: 350, prixVente: 550, tva: 0, unite: "sachet", stockActuel: 18, stockMinimum: 5, stockMaximum: 35, categorie: "Produits secs" },
  { reference: "SEC-010", codeBarres: null, nom: "Mil 5kg", description: "Sac de mil 5 kg", prixAchat: 1800, prixVente: 2500, tva: 0, unite: "sac", stockActuel: 10, stockMinimum: 3, stockMaximum: 30, categorie: "Produits secs" },
  { reference: "SEC-011", codeBarres: null, nom: "Mais en grains 1kg", description: "Sachet de mais en grains 1 kg", prixAchat: 400, prixVente: 600, tva: 0, unite: "sachet", stockActuel: 15, stockMinimum: 5, stockMaximum: 35, categorie: "Produits secs" },
  { reference: "SEC-012", codeBarres: null, nom: "Fonio 1kg", description: "Sachet de fonio 1 kg", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "sachet", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Produits secs" },

  // ─── Epicerie sucree (8) ──────────────────────────
  { reference: "ESU-001", codeBarres: null, nom: "Biscuits petit-beurre 200g", description: "Paquet de biscuits petit-beurre 200 g", prixAchat: 300, prixVente: 500, tva: 0, unite: "paquet", stockActuel: 30, stockMinimum: 10, stockMaximum: 80, categorie: "Epicerie sucree" },
  { reference: "ESU-002", codeBarres: null, nom: "Chocolat en tablette 100g", description: "Tablette de chocolat au lait 100 g", prixAchat: 500, prixVente: 800, tva: 0, unite: "tablette", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Epicerie sucree" },
  { reference: "ESU-003", codeBarres: null, nom: "Bonbons assortis 250g", description: "Sachet de bonbons assortis 250 g", prixAchat: 400, prixVente: 650, tva: 0, unite: "sachet", stockActuel: 25, stockMinimum: 8, stockMaximum: 60, categorie: "Epicerie sucree" },
  { reference: "ESU-004", codeBarres: null, nom: "Cacao en poudre 250g", description: "Boite de cacao en poudre 250 g", prixAchat: 800, prixVente: 1200, tva: 0, unite: "boite", stockActuel: 10, stockMinimum: 4, stockMaximum: 25, categorie: "Epicerie sucree" },
  { reference: "ESU-005", codeBarres: null, nom: "Levure chimique x10", description: "Lot de 10 sachets de levure chimique", prixAchat: 300, prixVente: 500, tva: 0, unite: "lot", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Epicerie sucree" },
  { reference: "ESU-006", codeBarres: null, nom: "Sucre vanille x10", description: "Lot de 10 sachets de sucre vanille", prixAchat: 250, prixVente: 400, tva: 0, unite: "lot", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Epicerie sucree" },
  { reference: "ESU-007", codeBarres: null, nom: "Gaufrettes x12", description: "Paquet de 12 gaufrettes", prixAchat: 350, prixVente: 550, tva: 0, unite: "paquet", stockActuel: 22, stockMinimum: 7, stockMaximum: 50, categorie: "Epicerie sucree" },
  { reference: "ESU-008", codeBarres: null, nom: "Chewing-gum x30", description: "Paquet de 30 chewing-gums", prixAchat: 200, prixVente: 350, tva: 0, unite: "paquet", stockActuel: 35, stockMinimum: 10, stockMaximum: 80, categorie: "Epicerie sucree" },

  // ─── Epicerie salee (6) ───────────────────────────
  { reference: "ESA-001", codeBarres: null, nom: "Cacahuetes grillees 250g", description: "Sachet de cacahuetes grillees 250 g", prixAchat: 300, prixVente: 500, tva: 0, unite: "sachet", stockActuel: 25, stockMinimum: 8, stockMaximum: 60, categorie: "Epicerie salee" },
  { reference: "ESA-002", codeBarres: null, nom: "Noix de cajou 200g", description: "Sachet de noix de cajou 200 g", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "sachet", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Epicerie salee" },
  { reference: "ESA-003", codeBarres: null, nom: "Chips nature 150g", description: "Sachet de chips nature 150 g", prixAchat: 350, prixVente: 550, tva: 0, unite: "sachet", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Epicerie salee" },
  { reference: "ESA-004", codeBarres: null, nom: "Biscuits sales x20", description: "Paquet de 20 biscuits sales", prixAchat: 400, prixVente: 650, tva: 0, unite: "paquet", stockActuel: 15, stockMinimum: 5, stockMaximum: 35, categorie: "Epicerie salee" },
  { reference: "ESA-005", codeBarres: null, nom: "Pop-corn 250g", description: "Sachet de mais a pop-corn 250 g", prixAchat: 200, prixVente: 350, tva: 0, unite: "sachet", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Epicerie salee" },
  { reference: "ESA-006", codeBarres: null, nom: "Olives vertes 200g", description: "Bocal d'olives vertes 200 g", prixAchat: 600, prixVente: 900, tva: 0, unite: "bocal", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Epicerie salee" },

  // ─── Produits bio et dietetiques (4) ──────────────
  { reference: "BIO-001", codeBarres: null, nom: "Miel pur 500g", description: "Pot de miel pur 500 g", prixAchat: 2000, prixVente: 3000, tva: 0, unite: "pot", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Produits bio et dietetiques" },
  { reference: "BIO-002", codeBarres: null, nom: "Moringa en poudre 100g", description: "Sachet de moringa en poudre 100 g", prixAchat: 800, prixVente: 1200, tva: 0, unite: "sachet", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Produits bio et dietetiques" },
  { reference: "BIO-003", codeBarres: null, nom: "Baobab en poudre 200g", description: "Sachet de poudre de baobab 200 g", prixAchat: 600, prixVente: 1000, tva: 0, unite: "sachet", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Produits bio et dietetiques" },
  { reference: "BIO-004", codeBarres: null, nom: "Huile de coco 250ml", description: "Bouteille d'huile de coco vierge 250 ml", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "bouteille", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Produits bio et dietetiques" },

  // ─── Petit-dejeuner (8) ───────────────────────────
  { reference: "PDJ-001", codeBarres: null, nom: "The Lipton x25", description: "Boite de 25 sachets de the Lipton", prixAchat: 700, prixVente: 950, tva: 0, unite: "boite", stockActuel: 0, stockMinimum: 5, stockMaximum: 30, categorie: "Petit-dejeuner" },
  { reference: "PDJ-002", codeBarres: null, nom: "Cafe moulu 250g", description: "Paquet de cafe moulu 250 g", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "paquet", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Petit-dejeuner" },
  { reference: "PDJ-003", codeBarres: null, nom: "Nescafe sachet x25", description: "Boite de 25 sachets de Nescafe", prixAchat: 1500, prixVente: 2200, tva: 0, unite: "boite", stockActuel: 10, stockMinimum: 4, stockMaximum: 25, categorie: "Petit-dejeuner" },
  { reference: "PDJ-004", codeBarres: null, nom: "Cereales corn flakes 500g", description: "Boite de corn flakes 500 g", prixAchat: 1000, prixVente: 1500, tva: 0, unite: "boite", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Petit-dejeuner" },
  { reference: "PDJ-005", codeBarres: null, nom: "Confiture fraise 370g", description: "Pot de confiture de fraise 370 g", prixAchat: 800, prixVente: 1200, tva: 0, unite: "pot", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Petit-dejeuner" },
  { reference: "PDJ-006", codeBarres: null, nom: "Pate a tartiner 400g", description: "Pot de pate a tartiner chocolat 400 g", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "pot", stockActuel: 7, stockMinimum: 3, stockMaximum: 20, categorie: "Petit-dejeuner" },
  { reference: "PDJ-007", codeBarres: null, nom: "Biscottes x36", description: "Paquet de 36 biscottes", prixAchat: 600, prixVente: 900, tva: 0, unite: "paquet", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Petit-dejeuner" },
  { reference: "PDJ-008", codeBarres: null, nom: "Kinkeliba x25 sachets", description: "Boite de 25 sachets de kinkeliba", prixAchat: 500, prixVente: 800, tva: 0, unite: "boite", stockActuel: 14, stockMinimum: 5, stockMaximum: 30, categorie: "Petit-dejeuner" },

  // ─── Bebe et puericulture (6) ─────────────────────
  { reference: "BEB-001", codeBarres: null, nom: "Couches bebe T3 x30", description: "Paquet de 30 couches taille 3", prixAchat: 3000, prixVente: 4500, tva: 0, unite: "paquet", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Bebe et puericulture" },
  { reference: "BEB-002", codeBarres: null, nom: "Lait infantile 400g", description: "Boite de lait infantile 1er age 400 g", prixAchat: 4000, prixVente: 5500, tva: 0, unite: "boite", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Bebe et puericulture" },
  { reference: "BEB-003", codeBarres: null, nom: "Compote bebe x4", description: "Pack de 4 compotes bebe", prixAchat: 800, prixVente: 1200, tva: 0, unite: "pack", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Bebe et puericulture" },
  { reference: "BEB-004", codeBarres: null, nom: "Biberon 250ml", description: "Biberon 250 ml avec tetine", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "piece", stockActuel: 5, stockMinimum: 2, stockMaximum: 10, categorie: "Bebe et puericulture" },
  { reference: "BEB-005", codeBarres: null, nom: "Lingettes bebe x72", description: "Paquet de 72 lingettes bebe", prixAchat: 800, prixVente: 1200, tva: 0, unite: "paquet", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Bebe et puericulture" },
  { reference: "BEB-006", codeBarres: null, nom: "Cereales bebe 200g", description: "Boite de cereales pour bebe 200 g", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "boite", stockActuel: 7, stockMinimum: 2, stockMaximum: 15, categorie: "Bebe et puericulture" },

  // ─── Eaux et sodas (10) ───────────────────────────
  { reference: "EAS-001", codeBarres: "3800030000401", nom: "Eau minerale 1.5L", description: "Bouteille d'eau minerale 1,5 L", prixAchat: 250, prixVente: 400, tva: 0, unite: "bouteille", stockActuel: 60, stockMinimum: 20, stockMaximum: 300, categorie: "Eaux et sodas" },
  { reference: "EAS-002", codeBarres: "3800030000402", nom: "Jus de bissap 33cl", description: "Bouteille de jus de bissap 33 cl", prixAchat: 200, prixVente: 350, tva: 0, unite: "bouteille", stockActuel: 4, stockMinimum: 10, stockMaximum: 120, categorie: "Eaux et sodas" },
  { reference: "EAS-003", codeBarres: null, nom: "Coca-Cola 33cl", description: "Canette de Coca-Cola 33 cl", prixAchat: 250, prixVente: 400, tva: 0, unite: "canette", stockActuel: 48, stockMinimum: 15, stockMaximum: 120, categorie: "Eaux et sodas" },
  { reference: "EAS-004", codeBarres: null, nom: "Fanta orange 33cl", description: "Canette de Fanta orange 33 cl", prixAchat: 250, prixVente: 400, tva: 0, unite: "canette", stockActuel: 36, stockMinimum: 12, stockMaximum: 100, categorie: "Eaux et sodas" },
  { reference: "EAS-005", codeBarres: null, nom: "Jus de gingembre 33cl", description: "Bouteille de jus de gingembre 33 cl", prixAchat: 200, prixVente: 350, tva: 0, unite: "bouteille", stockActuel: 20, stockMinimum: 8, stockMaximum: 60, categorie: "Eaux et sodas" },
  { reference: "EAS-006", codeBarres: null, nom: "Eau gazeuse 1L", description: "Bouteille d'eau gazeuse 1 L", prixAchat: 300, prixVente: 500, tva: 0, unite: "bouteille", stockActuel: 15, stockMinimum: 5, stockMaximum: 40, categorie: "Eaux et sodas" },
  { reference: "EAS-007", codeBarres: null, nom: "Jus de mangue 1L", description: "Brique de jus de mangue 1 L", prixAchat: 500, prixVente: 800, tva: 0, unite: "brique", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Eaux et sodas" },
  { reference: "EAS-008", codeBarres: null, nom: "Sprite 1.5L", description: "Bouteille de Sprite 1,5 L", prixAchat: 500, prixVente: 750, tva: 0, unite: "bouteille", stockActuel: 12, stockMinimum: 4, stockMaximum: 30, categorie: "Eaux et sodas" },
  { reference: "EAS-009", codeBarres: null, nom: "Eau minerale 50cl x6", description: "Pack de 6 bouteilles d'eau 50 cl", prixAchat: 600, prixVente: 900, tva: 0, unite: "pack", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Eaux et sodas" },
  { reference: "EAS-010", codeBarres: null, nom: "Jus de baobab 33cl", description: "Bouteille de jus de baobab (bouye) 33 cl", prixAchat: 200, prixVente: 350, tva: 0, unite: "bouteille", stockActuel: 15, stockMinimum: 5, stockMaximum: 40, categorie: "Eaux et sodas" },

  // ─── Boissons alcoolisees (5) ─────────────────────
  { reference: "ALC-001", codeBarres: null, nom: "Biere Flag 33cl", description: "Bouteille de biere Flag 33 cl", prixAchat: 400, prixVente: 650, tva: 0, unite: "bouteille", stockActuel: 30, stockMinimum: 10, stockMaximum: 80, categorie: "Boissons alcoolisees" },
  { reference: "ALC-002", codeBarres: null, nom: "Biere Castel 50cl", description: "Bouteille de biere Castel 50 cl", prixAchat: 500, prixVente: 800, tva: 0, unite: "bouteille", stockActuel: 24, stockMinimum: 8, stockMaximum: 60, categorie: "Boissons alcoolisees" },
  { reference: "ALC-003", codeBarres: null, nom: "Vin rouge 75cl", description: "Bouteille de vin rouge 75 cl", prixAchat: 2000, prixVente: 3500, tva: 0, unite: "bouteille", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Boissons alcoolisees" },
  { reference: "ALC-004", codeBarres: null, nom: "Whisky 70cl", description: "Bouteille de whisky 70 cl", prixAchat: 5000, prixVente: 8000, tva: 0, unite: "bouteille", stockActuel: 4, stockMinimum: 1, stockMaximum: 10, categorie: "Boissons alcoolisees" },
  { reference: "ALC-005", codeBarres: null, nom: "Vin de palme 1L", description: "Bouteille de vin de palme 1 L", prixAchat: 300, prixVente: 500, tva: 0, unite: "bouteille", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Boissons alcoolisees" },

  // ─── Produits menagers (10) ───────────────────────
  { reference: "MEN-001", codeBarres: "3800030000501", nom: "Lessive en poudre 1kg", description: "Sachet de lessive en poudre 1 kg", prixAchat: 1200, prixVente: 1500, tva: 0, unite: "sachet", stockActuel: 2, stockMinimum: 5, stockMaximum: 40, categorie: "Produits menagers" },
  { reference: "MEN-002", codeBarres: null, nom: "Eau de Javel 1L", description: "Bouteille d'eau de Javel 1 L", prixAchat: 350, prixVente: 500, tva: 0, unite: "bouteille", stockActuel: 25, stockMinimum: 8, stockMaximum: 50, categorie: "Produits menagers" },
  { reference: "MEN-003", codeBarres: null, nom: "Liquide vaisselle 500ml", description: "Flacon de liquide vaisselle 500 ml", prixAchat: 400, prixVente: 600, tva: 0, unite: "flacon", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Produits menagers" },
  { reference: "MEN-004", codeBarres: null, nom: "Eponge x3", description: "Lot de 3 eponges a recurer", prixAchat: 150, prixVente: 250, tva: 0, unite: "lot", stockActuel: 30, stockMinimum: 10, stockMaximum: 60, categorie: "Produits menagers" },
  { reference: "MEN-005", codeBarres: null, nom: "Balai brosse", description: "Balai brosse pour carrelage", prixAchat: 800, prixVente: 1200, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 15, categorie: "Produits menagers" },
  { reference: "MEN-006", codeBarres: null, nom: "Serpillere", description: "Serpillere en microfibre", prixAchat: 500, prixVente: 800, tva: 0, unite: "piece", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Produits menagers" },
  { reference: "MEN-007", codeBarres: null, nom: "Desinfectant sol 1L", description: "Bouteille de desinfectant pour sol 1 L", prixAchat: 600, prixVente: 900, tva: 0, unite: "bouteille", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Produits menagers" },
  { reference: "MEN-008", codeBarres: null, nom: "Sacs poubelle x20", description: "Rouleau de 20 sacs poubelle 50L", prixAchat: 300, prixVente: 500, tva: 0, unite: "rouleau", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Produits menagers" },
  { reference: "MEN-009", codeBarres: null, nom: "Insecticide spray 400ml", description: "Bombe insecticide 400 ml", prixAchat: 800, prixVente: 1200, tva: 0, unite: "bombe", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Produits menagers" },
  { reference: "MEN-010", codeBarres: null, nom: "Allumettes x10 boites", description: "Lot de 10 boites d'allumettes", prixAchat: 200, prixVente: 350, tva: 0, unite: "lot", stockActuel: 25, stockMinimum: 8, stockMaximum: 50, categorie: "Produits menagers" },

  // ─── Hygiene et soins (12) ────────────────────────
  { reference: "HYG-001", codeBarres: "3800030000601", nom: "Savon de Marseille 200g", description: "Pain de savon de Marseille 200 g", prixAchat: 300, prixVente: 500, tva: 0, unite: "piece", stockActuel: 35, stockMinimum: 10, stockMaximum: 100, categorie: "Hygiene et soins" },
  { reference: "HYG-002", codeBarres: null, nom: "Dentifrice Signal 100ml", description: "Tube de dentifrice Signal 100 ml", prixAchat: 500, prixVente: 750, tva: 0, unite: "tube", stockActuel: 20, stockMinimum: 8, stockMaximum: 60, categorie: "Hygiene et soins" },
  { reference: "HYG-003", codeBarres: null, nom: "Brosse a dents", description: "Brosse a dents souple adulte", prixAchat: 200, prixVente: 350, tva: 0, unite: "piece", stockActuel: 25, stockMinimum: 8, stockMaximum: 50, categorie: "Hygiene et soins" },
  { reference: "HYG-004", codeBarres: null, nom: "Papier toilette x4", description: "Lot de 4 rouleaux de papier toilette", prixAchat: 500, prixVente: 800, tva: 0, unite: "lot", stockActuel: 20, stockMinimum: 6, stockMaximum: 40, categorie: "Hygiene et soins" },
  { reference: "HYG-005", codeBarres: null, nom: "Serviettes hygieniques x10", description: "Paquet de 10 serviettes hygieniques", prixAchat: 400, prixVente: 650, tva: 0, unite: "paquet", stockActuel: 15, stockMinimum: 5, stockMaximum: 35, categorie: "Hygiene et soins" },
  { reference: "HYG-006", codeBarres: null, nom: "Deodorant spray 150ml", description: "Deodorant spray 150 ml", prixAchat: 600, prixVente: 950, tva: 0, unite: "piece", stockActuel: 12, stockMinimum: 4, stockMaximum: 30, categorie: "Hygiene et soins" },
  { reference: "HYG-007", codeBarres: null, nom: "Rasoir jetable x5", description: "Lot de 5 rasoirs jetables", prixAchat: 350, prixVente: 550, tva: 0, unite: "lot", stockActuel: 18, stockMinimum: 6, stockMaximum: 40, categorie: "Hygiene et soins" },
  { reference: "HYG-008", codeBarres: null, nom: "Coton hydrophile 100g", description: "Sachet de coton hydrophile 100 g", prixAchat: 250, prixVente: 400, tva: 0, unite: "sachet", stockActuel: 14, stockMinimum: 5, stockMaximum: 30, categorie: "Hygiene et soins" },
  { reference: "HYG-009", codeBarres: null, nom: "Mouchoirs x10 paquets", description: "Lot de 10 paquets de mouchoirs", prixAchat: 300, prixVente: 500, tva: 0, unite: "lot", stockActuel: 16, stockMinimum: 5, stockMaximum: 35, categorie: "Hygiene et soins" },
  { reference: "HYG-010", codeBarres: null, nom: "Gel douche 250ml", description: "Flacon de gel douche 250 ml", prixAchat: 600, prixVente: 900, tva: 0, unite: "flacon", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Hygiene et soins" },
  { reference: "HYG-011", codeBarres: null, nom: "Savon liquide 500ml", description: "Flacon pompe de savon liquide 500 ml", prixAchat: 500, prixVente: 800, tva: 0, unite: "flacon", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Hygiene et soins" },
  { reference: "HYG-012", codeBarres: null, nom: "Essuie-tout x2", description: "Lot de 2 rouleaux d'essuie-tout", prixAchat: 400, prixVente: 650, tva: 0, unite: "lot", stockActuel: 14, stockMinimum: 5, stockMaximum: 30, categorie: "Hygiene et soins" },

  // ─── Cosmetiques et parfumerie (8) ────────────────
  { reference: "COS-001", codeBarres: null, nom: "Creme hydratante 200ml", description: "Pot de creme hydratante corps 200 ml", prixAchat: 800, prixVente: 1300, tva: 0, unite: "pot", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-002", codeBarres: null, nom: "Lait corporel 400ml", description: "Flacon de lait corporel 400 ml", prixAchat: 1200, prixVente: 1800, tva: 0, unite: "flacon", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-003", codeBarres: null, nom: "Shampoing 250ml", description: "Flacon de shampoing 250 ml", prixAchat: 700, prixVente: 1100, tva: 0, unite: "flacon", stockActuel: 12, stockMinimum: 4, stockMaximum: 30, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-004", codeBarres: null, nom: "Huile de karite 100ml", description: "Flacon d'huile de karite 100 ml", prixAchat: 1000, prixVente: 1600, tva: 0, unite: "flacon", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-005", codeBarres: null, nom: "Defrisage kit", description: "Kit de defrisage cheveux", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "kit", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-006", codeBarres: null, nom: "Vaseline 250ml", description: "Pot de vaseline 250 ml", prixAchat: 400, prixVente: 650, tva: 0, unite: "pot", stockActuel: 15, stockMinimum: 5, stockMaximum: 35, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-007", codeBarres: null, nom: "Parfum spray 100ml", description: "Flacon de parfum spray 100 ml", prixAchat: 2000, prixVente: 3500, tva: 0, unite: "flacon", stockActuel: 4, stockMinimum: 1, stockMaximum: 10, categorie: "Cosmetiques et parfumerie" },
  { reference: "COS-008", codeBarres: null, nom: "Creme eclaircissante 200ml", description: "Pot de creme eclaircissante 200 ml", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "pot", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Cosmetiques et parfumerie" },

  // ─── Textile et linge (6) ─────────────────────────
  { reference: "TEX-001", codeBarres: null, nom: "T-shirt homme", description: "T-shirt homme taille unique", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "piece", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Textile et linge" },
  { reference: "TEX-002", codeBarres: null, nom: "Pagne tissu 6 yards", description: "Pagne tissu wax 6 yards", prixAchat: 3000, prixVente: 5000, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 2, stockMaximum: 20, categorie: "Textile et linge" },
  { reference: "TEX-003", codeBarres: null, nom: "Chaussettes homme x3", description: "Lot de 3 paires de chaussettes homme", prixAchat: 500, prixVente: 800, tva: 0, unite: "lot", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Textile et linge" },
  { reference: "TEX-004", codeBarres: null, nom: "Drap housse 2 places", description: "Drap housse 2 places", prixAchat: 2000, prixVente: 3500, tva: 0, unite: "piece", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Textile et linge" },
  { reference: "TEX-005", codeBarres: null, nom: "Serviette de bain", description: "Serviette de bain 70x140 cm", prixAchat: 1200, prixVente: 2000, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Textile et linge" },
  { reference: "TEX-006", codeBarres: null, nom: "Sandales plastique", description: "Paire de sandales en plastique", prixAchat: 500, prixVente: 900, tva: 0, unite: "paire", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Textile et linge" },

  // ─── Quincaillerie et bricolage (7) ───────────────
  { reference: "QUI-001", codeBarres: null, nom: "Ampoule LED 9W", description: "Ampoule LED 9W culot E27", prixAchat: 400, prixVente: 700, tva: 0, unite: "piece", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Quincaillerie et bricolage" },
  { reference: "QUI-002", codeBarres: null, nom: "Prise multiple 4 postes", description: "Multiprise 4 postes avec interrupteur", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "piece", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Quincaillerie et bricolage" },
  { reference: "QUI-003", codeBarres: null, nom: "Cadenas 40mm", description: "Cadenas en laiton 40 mm", prixAchat: 800, prixVente: 1300, tva: 0, unite: "piece", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Quincaillerie et bricolage" },
  { reference: "QUI-004", codeBarres: null, nom: "Ruban adhesif", description: "Rouleau de ruban adhesif transparent", prixAchat: 200, prixVente: 350, tva: 0, unite: "rouleau", stockActuel: 18, stockMinimum: 5, stockMaximum: 40, categorie: "Quincaillerie et bricolage" },
  { reference: "QUI-005", codeBarres: null, nom: "Corde nylon 10m", description: "Corde en nylon 10 metres", prixAchat: 500, prixVente: 800, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 2, stockMaximum: 15, categorie: "Quincaillerie et bricolage" },
  { reference: "QUI-006", codeBarres: null, nom: "Clous 500g", description: "Sachet de clous assortis 500 g", prixAchat: 300, prixVente: 500, tva: 0, unite: "sachet", stockActuel: 12, stockMinimum: 4, stockMaximum: 25, categorie: "Quincaillerie et bricolage" },
  { reference: "QUI-007", codeBarres: null, nom: "Lampe torche LED", description: "Lampe torche LED rechargeable", prixAchat: 1200, prixVente: 2000, tva: 0, unite: "piece", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Quincaillerie et bricolage" },

  // ─── Electromenager (5) ───────────────────────────
  { reference: "ELM-001", codeBarres: null, nom: "Ventilateur de table", description: "Ventilateur de table 30 cm", prixAchat: 5000, prixVente: 8000, tva: 0, unite: "piece", stockActuel: 4, stockMinimum: 1, stockMaximum: 10, categorie: "Electromenager" },
  { reference: "ELM-002", codeBarres: null, nom: "Bouilloire electrique 1.7L", description: "Bouilloire electrique 1,7 L", prixAchat: 4000, prixVente: 6500, tva: 0, unite: "piece", stockActuel: 3, stockMinimum: 1, stockMaximum: 8, categorie: "Electromenager" },
  { reference: "ELM-003", codeBarres: null, nom: "Fer a repasser", description: "Fer a repasser electrique", prixAchat: 3500, prixVente: 5500, tva: 0, unite: "piece", stockActuel: 3, stockMinimum: 1, stockMaximum: 8, categorie: "Electromenager" },
  { reference: "ELM-004", codeBarres: null, nom: "Mixeur plongeant", description: "Mixeur plongeant electrique", prixAchat: 4500, prixVente: 7000, tva: 0, unite: "piece", stockActuel: 2, stockMinimum: 1, stockMaximum: 6, categorie: "Electromenager" },
  { reference: "ELM-005", codeBarres: null, nom: "Radio FM portable", description: "Radio FM portable a piles", prixAchat: 2000, prixVente: 3500, tva: 0, unite: "piece", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Electromenager" },

  // ─── Jouets et loisirs (5) ────────────────────────
  { reference: "JOU-001", codeBarres: null, nom: "Ballon de football", description: "Ballon de football taille 5", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "piece", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Jouets et loisirs" },
  { reference: "JOU-002", codeBarres: null, nom: "Jeu de cartes", description: "Jeu de 52 cartes classique", prixAchat: 300, prixVente: 500, tva: 0, unite: "piece", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Jouets et loisirs" },
  { reference: "JOU-003", codeBarres: null, nom: "Poupee", description: "Poupee pour enfant", prixAchat: 1000, prixVente: 1800, tva: 0, unite: "piece", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Jouets et loisirs" },
  { reference: "JOU-004", codeBarres: null, nom: "Corde a sauter", description: "Corde a sauter enfant", prixAchat: 300, prixVente: 500, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 15, categorie: "Jouets et loisirs" },
  { reference: "JOU-005", codeBarres: null, nom: "Jeu de dames", description: "Jeu de dames traditionnel", prixAchat: 500, prixVente: 900, tva: 0, unite: "piece", stockActuel: 4, stockMinimum: 1, stockMaximum: 10, categorie: "Jouets et loisirs" },

  // ─── Papeterie et fournitures (8) ─────────────────
  { reference: "PAP-001", codeBarres: "3800030000701", nom: "Cahier 200 pages", description: "Cahier grand format 200 pages", prixAchat: 400, prixVente: 600, tva: 0, unite: "piece", stockActuel: 50, stockMinimum: 15, stockMaximum: 200, categorie: "Papeterie et fournitures" },
  { reference: "PAP-002", codeBarres: null, nom: "Stylo Bic bleu x10", description: "Lot de 10 stylos Bic bleus", prixAchat: 800, prixVente: 1200, tva: 0, unite: "lot", stockActuel: 0, stockMinimum: 5, stockMaximum: 50, categorie: "Papeterie et fournitures" },
  { reference: "PAP-003", codeBarres: null, nom: "Crayon a papier x12", description: "Lot de 12 crayons a papier HB", prixAchat: 400, prixVente: 650, tva: 0, unite: "lot", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Papeterie et fournitures" },
  { reference: "PAP-004", codeBarres: null, nom: "Gomme x2", description: "Lot de 2 gommes blanches", prixAchat: 100, prixVente: 200, tva: 0, unite: "lot", stockActuel: 30, stockMinimum: 10, stockMaximum: 60, categorie: "Papeterie et fournitures" },
  { reference: "PAP-005", codeBarres: null, nom: "Regle 30cm", description: "Regle plastique 30 cm", prixAchat: 100, prixVente: 200, tva: 0, unite: "piece", stockActuel: 25, stockMinimum: 8, stockMaximum: 50, categorie: "Papeterie et fournitures" },
  { reference: "PAP-006", codeBarres: null, nom: "Taille-crayon", description: "Taille-crayon metallique", prixAchat: 50, prixVente: 100, tva: 0, unite: "piece", stockActuel: 35, stockMinimum: 10, stockMaximum: 80, categorie: "Papeterie et fournitures" },
  { reference: "PAP-007", codeBarres: null, nom: "Cahier de dessin A4", description: "Cahier de dessin A4 48 pages", prixAchat: 300, prixVente: 500, tva: 0, unite: "piece", stockActuel: 15, stockMinimum: 5, stockMaximum: 40, categorie: "Papeterie et fournitures" },
  { reference: "PAP-008", codeBarres: null, nom: "Marqueurs couleur x12", description: "Boite de 12 marqueurs couleur", prixAchat: 800, prixVente: 1300, tva: 0, unite: "boite", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Papeterie et fournitures" },

  // ─── Decoration et vaisselle (6) ──────────────────
  { reference: "DEC-001", codeBarres: null, nom: "Assiettes plastique x20", description: "Lot de 20 assiettes plastique", prixAchat: 400, prixVente: 700, tva: 0, unite: "lot", stockActuel: 15, stockMinimum: 5, stockMaximum: 30, categorie: "Decoration et vaisselle" },
  { reference: "DEC-002", codeBarres: null, nom: "Gobelets plastique x50", description: "Sachet de 50 gobelets plastique", prixAchat: 300, prixVente: 500, tva: 0, unite: "sachet", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Decoration et vaisselle" },
  { reference: "DEC-003", codeBarres: null, nom: "Bougie decorative x4", description: "Lot de 4 bougies decoratives", prixAchat: 500, prixVente: 850, tva: 0, unite: "lot", stockActuel: 8, stockMinimum: 2, stockMaximum: 15, categorie: "Decoration et vaisselle" },
  { reference: "DEC-004", codeBarres: null, nom: "Verre a the x6", description: "Lot de 6 verres a the", prixAchat: 600, prixVente: 1000, tva: 0, unite: "lot", stockActuel: 10, stockMinimum: 3, stockMaximum: 20, categorie: "Decoration et vaisselle" },
  { reference: "DEC-005", codeBarres: null, nom: "Nappe plastique", description: "Nappe plastique imprimee", prixAchat: 400, prixVente: 700, tva: 0, unite: "piece", stockActuel: 6, stockMinimum: 2, stockMaximum: 12, categorie: "Decoration et vaisselle" },
  { reference: "DEC-006", codeBarres: null, nom: "Plateau de service", description: "Plateau de service en plastique", prixAchat: 300, prixVente: 550, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 2, stockMaximum: 15, categorie: "Decoration et vaisselle" },

  // ─── Bagagerie (3) ────────────────────────────────
  { reference: "BAG-001", codeBarres: null, nom: "Sac a dos scolaire", description: "Sac a dos scolaire enfant", prixAchat: 2000, prixVente: 3500, tva: 0, unite: "piece", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Bagagerie" },
  { reference: "BAG-002", codeBarres: null, nom: "Sac de voyage 60L", description: "Sac de voyage 60 litres", prixAchat: 3000, prixVente: 5000, tva: 0, unite: "piece", stockActuel: 4, stockMinimum: 1, stockMaximum: 10, categorie: "Bagagerie" },
  { reference: "BAG-003", codeBarres: null, nom: "Sacoche bandouliere", description: "Sacoche bandouliere homme", prixAchat: 1500, prixVente: 2500, tva: 0, unite: "piece", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Bagagerie" },

  // ─── Alimentation animale (4) ─────────────────────
  { reference: "ANI-001", codeBarres: null, nom: "Croquettes chien 5kg", description: "Sac de croquettes pour chien 5 kg", prixAchat: 3000, prixVente: 4500, tva: 0, unite: "sac", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Alimentation animale" },
  { reference: "ANI-002", codeBarres: null, nom: "Croquettes chat 2kg", description: "Sac de croquettes pour chat 2 kg", prixAchat: 2000, prixVente: 3000, tva: 0, unite: "sac", stockActuel: 6, stockMinimum: 2, stockMaximum: 15, categorie: "Alimentation animale" },
  { reference: "ANI-003", codeBarres: null, nom: "Graines pour oiseaux 1kg", description: "Sachet de graines pour oiseaux 1 kg", prixAchat: 500, prixVente: 800, tva: 0, unite: "sachet", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Alimentation animale" },
  { reference: "ANI-004", codeBarres: null, nom: "Aliment pour poissons 100g", description: "Boite d'aliment pour poissons 100 g", prixAchat: 400, prixVente: 700, tva: 0, unite: "boite", stockActuel: 5, stockMinimum: 2, stockMaximum: 10, categorie: "Alimentation animale" },

  // ─── Divers (7) ───────────────────────────────────
  { reference: "DIV-001", codeBarres: "3800030000801", nom: "Piles AA x4", description: "Lot de 4 piles alcalines AA", prixAchat: 500, prixVente: 800, tva: 0, unite: "lot", stockActuel: 10, stockMinimum: 5, stockMaximum: 30, categorie: "Divers" },
  { reference: "DIV-002", codeBarres: null, nom: "Sac plastique x50", description: "Paquet de 50 sacs plastiques", prixAchat: 200, prixVente: 350, tva: 0, unite: "paquet", stockActuel: 40, stockMinimum: 10, stockMaximum: 100, categorie: "Divers" },
  { reference: "DIV-003", codeBarres: null, nom: "Briquet x5", description: "Lot de 5 briquets jetables", prixAchat: 250, prixVente: 400, tva: 0, unite: "lot", stockActuel: 20, stockMinimum: 6, stockMaximum: 50, categorie: "Divers" },
  { reference: "DIV-004", codeBarres: null, nom: "Chargeur telephone universel", description: "Chargeur de telephone universel USB", prixAchat: 800, prixVente: 1500, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 3, stockMaximum: 20, categorie: "Divers" },
  { reference: "DIV-005", codeBarres: null, nom: "Ecouteurs filaires", description: "Ecouteurs filaires jack 3.5mm", prixAchat: 500, prixVente: 900, tva: 0, unite: "piece", stockActuel: 10, stockMinimum: 3, stockMaximum: 25, categorie: "Divers" },
  { reference: "DIV-006", codeBarres: null, nom: "Parapluie pliable", description: "Parapluie pliable compact", prixAchat: 1000, prixVente: 1800, tva: 0, unite: "piece", stockActuel: 5, stockMinimum: 2, stockMaximum: 12, categorie: "Divers" },
  { reference: "DIV-007", codeBarres: null, nom: "Cadre photo 10x15", description: "Cadre photo 10x15 cm", prixAchat: 300, prixVente: 550, tva: 0, unite: "piece", stockActuel: 8, stockMinimum: 2, stockMaximum: 15, categorie: "Divers" },
];

/**
 * Seed les produits de demo (dev uniquement).
 * Necessite une categorieMap (retour de seedDefaultCategories).
 */
export async function seedDevProduits(
  prisma: PrismaClient,
  categorieMap: Map<string, string>,
): Promise<void> {
  let count = 0;
  for (const prod of DEV_PRODUITS) {
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
      create: { reference: prod.reference, ...data },
      update: data,
    });
    count++;
  }

  const ruptures = DEV_PRODUITS.filter((p) => p.stockActuel === 0).length;
  const alertes = DEV_PRODUITS.filter((p) => p.stockActuel > 0 && p.stockActuel <= p.stockMinimum).length;
  console.log(`\nSeed OK — ${count} produits crees/mis a jour (${ruptures} en rupture, ${alertes} en alerte)`);
}
