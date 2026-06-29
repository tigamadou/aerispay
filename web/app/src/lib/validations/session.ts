import { z } from "zod";

export const openSessionSchema = z.object({
  declarations: z.record(
    z.string().min(1),
    z.number().min(0, "Le montant doit être positif ou nul"),
  ).refine(
    (obj) => Object.keys(obj).length > 0,
    "Au moins un mode de paiement doit être déclaré",
  ),
  confirmeEcart: z.boolean().optional(),
  caisseId: z.string().optional(),
});

// Conservé pour rétrocompatibilité — la nouvelle clôture utilise
// declarationCloturSchema dans mouvement-caisse.ts
export const closeSessionSchema = z.object({
  montantFermetureCash: z
    .number()
    .min(0, "Le montant cash doit être positif ou nul"),
  montantFermetureMobileMoney: z
    .number()
    .min(0, "Le montant mobile money doit être positif ou nul"),
  notes: z.string().max(500).optional(),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
