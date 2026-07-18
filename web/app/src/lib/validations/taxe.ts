import { z } from "zod";

export const createTaxeSchema = z.object({
  nom: z.string().min(1, "Le nom de la taxe est obligatoire").max(50),
  taux: z.number().min(0, "Le taux doit etre positif").max(100, "Le taux ne peut pas depasser 100%"),
  active: z.boolean().default(true),
  ordre: z.number().int().min(0).default(0),
});

export const updateTaxeSchema = createTaxeSchema.partial();

export type CreateTaxeInput = z.infer<typeof createTaxeSchema>;
export type UpdateTaxeInput = z.infer<typeof updateTaxeSchema>;
