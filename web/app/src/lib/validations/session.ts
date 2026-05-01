import { z } from "zod";

export const openSessionSchema = z.object({
  montantOuvertureCash: z
    .number()
    .min(0, "Le montant cash doit être positif ou nul"),
  montantOuvertureMobileMoney: z
    .number()
    .min(0, "Le montant mobile money doit être positif ou nul")
    .default(0),
});

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
