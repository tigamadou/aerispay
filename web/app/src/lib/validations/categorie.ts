import { z } from "zod";

export const createCategorieSchema = z.object({
  nom: z.string().min(2, "Nom trop court").max(100, "Nom trop long"),
  description: z.string().optional(),
  couleur: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Code couleur invalide (format #RRGGBB)")
    .optional(),
});

export const updateCategorieSchema = z.object({
  nom: z.string().min(2, "Nom trop court").max(100, "Nom trop long").optional(),
  description: z.string().nullable().optional(),
  couleur: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Code couleur invalide (format #RRGGBB)")
    .nullable()
    .optional(),
});

export type CreateCategorieInput = z.infer<typeof createCategorieSchema>;
export type UpdateCategorieInput = z.infer<typeof updateCategorieSchema>;
