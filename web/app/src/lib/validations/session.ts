import { z } from "zod";

export const openSessionSchema = z.object({
  montantOuverture: z
    .number()
    .min(0, "Le montant d'ouverture doit être positif ou nul"),
});

export const closeSessionSchema = z.object({
  montantFermeture: z
    .number()
    .min(0, "Le montant de fermeture doit être positif ou nul"),
  notes: z.string().max(500).optional(),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
