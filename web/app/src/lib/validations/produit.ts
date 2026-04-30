import { z } from "zod";

export const createProductSchema = z
  .object({
    reference: z.string().optional(),
    codeBarres: z.string().trim().min(4).max(64).optional(),
    nom: z.string().min(2, "Nom trop court").max(100, "Nom trop long"),
    categorieId: z.string().min(1, "Catégorie requise"),
    prixAchat: z.number().positive("Prix achat doit être positif"),
    prixVente: z.number().positive("Prix vente doit être positif"),
    tva: z.number().min(0).max(100).default(0),
    unite: z.string().default("unité"),
    stockMinimum: z.number().int().min(0).default(5),
    stockMaximum: z.number().int().positive().optional(),
    description: z.string().optional(),
  })
  .refine((d) => d.prixVente > d.prixAchat, {
    message: "Le prix de vente doit être supérieur au prix d'achat",
    path: ["prixVente"],
  });

export const updateProductSchema = z
  .object({
    codeBarres: z.string().trim().min(4).max(64).nullable().optional(),
    nom: z.string().min(2, "Nom trop court").max(100, "Nom trop long").optional(),
    categorieId: z.string().min(1, "Catégorie requise").optional(),
    prixAchat: z.number().positive("Prix achat doit être positif").optional(),
    prixVente: z.number().positive("Prix vente doit être positif").optional(),
    tva: z.number().min(0).max(100).optional(),
    unite: z.string().optional(),
    stockMinimum: z.number().int().min(0).optional(),
    stockMaximum: z.number().int().positive().nullable().optional(),
    description: z.string().nullable().optional(),
    actif: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.prixVente !== undefined && d.prixAchat !== undefined) {
        return d.prixVente > d.prixAchat;
      }
      return true;
    },
    {
      message: "Le prix de vente doit être supérieur au prix d'achat",
      path: ["prixVente"],
    }
  );

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
