import { z } from "zod";

export const parametresSchema = z.object({
  nomCommerce: z.string().min(1, "Le nom du commerce est obligatoire").max(255),
  adresse: z.string().max(500).default(""),
  telephone: z.string().max(50).default(""),
  email: z.string().email("Email invalide").max(255).or(z.literal("")).default(""),
  rccm: z.string().max(100).default(""),
  nif: z.string().max(100).default(""),
  logo: z.string().nullable().optional(),
});

export type ParametresInput = z.infer<typeof parametresSchema>;
