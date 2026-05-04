import { z } from "zod";

const ligneVenteSchema = z.object({
  produitId: z.string().min(1, "Produit requis"),
  quantite: z.number().int().positive("La quantité doit être > 0"),
  prixUnitaire: z.number().positive("Le prix unitaire doit être > 0"),
  tva: z.number().min(0).max(100).default(0),
  remise: z.number().min(0).max(100).default(0),
});

const paiementSchema = z.object({
  mode: z.string().min(1, "Mode de paiement requis"),
  montant: z.number().positive("Le montant doit être > 0"),
  reference: z.string().optional(),
});

export const createVenteSchema = z.object({
  sessionId: z.string().min(1, "Session de comptoir requise"),
  lignes: z
    .array(ligneVenteSchema)
    .min(1, "Au moins un article requis"),
  paiements: z
    .array(paiementSchema)
    .min(1, "Au moins un paiement requis")
    .max(2, "Maximum 2 modes de paiement"),
  remise: z.number().min(0).default(0),
  nomClient: z.string().max(100).optional(),
  notesCaissier: z.string().max(500).optional(),
});

export type CreateVenteInput = z.infer<typeof createVenteSchema>;
export type LigneVenteInput = z.infer<typeof ligneVenteSchema>;
export type PaiementInput = z.infer<typeof paiementSchema>;
