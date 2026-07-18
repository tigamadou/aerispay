import { z } from "zod";

export const createMouvementSchema = z
  .object({
    produitId: z.string().min(1, "Produit requis"),
    type: z.enum(["ENTREE", "SORTIE", "AJUSTEMENT", "PERTE"], {
      errorMap: () => ({ message: "Type de mouvement invalide" }),
    }),
    quantite: z.number().int().positive("La quantité doit être positive"),
    motif: z.string().optional(),
    reference: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.type === "AJUSTEMENT" || d.type === "PERTE") {
        return !!d.motif && d.motif.length > 3;
      }
      return true;
    },
    {
      message: "Motif obligatoire pour ce type de mouvement (min. 4 caractères)",
      path: ["motif"],
    }
  );

export type CreateMouvementInput = z.infer<typeof createMouvementSchema>;
