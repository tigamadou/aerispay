import { z } from "zod";

export const createUserSchema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(100, "Le nom ne peut dépasser 100 caractères"),
  email: z
    .string()
    .email("Email invalide")
    .transform((v) => v.trim().toLowerCase()),
  motDePasse: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(72, "Le mot de passe ne peut dépasser 72 caractères"),
  role: z.enum(["ADMIN", "MANAGER", "CAISSIER"], {
    errorMap: () => ({ message: "Rôle invalide" }),
  }),
});

export const updateUserSchema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(100, "Le nom ne peut dépasser 100 caractères")
    .optional(),
  email: z
    .string()
    .email("Email invalide")
    .transform((v) => v.trim().toLowerCase())
    .optional(),
  motDePasse: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(72, "Le mot de passe ne peut dépasser 72 caractères")
    .optional(),
  role: z
    .enum(["ADMIN", "MANAGER", "CAISSIER"], {
      errorMap: () => ({ message: "Rôle invalide" }),
    })
    .optional(),
  actif: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
