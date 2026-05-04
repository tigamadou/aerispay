import { z } from "zod";

export const TYPE_MOUVEMENT_MANUEL = [
  "APPORT",
  "RETRAIT",
  "DEPENSE",
] as const;

export const createMouvementManuelSchema = z.object({
  sessionId: z.string().min(1, "Session de comptoir requise"),
  type: z.enum(TYPE_MOUVEMENT_MANUEL, {
    errorMap: () => ({ message: "Type de mouvement invalide (APPORT, RETRAIT ou DEPENSE)" }),
  }),
  mode: z.string().min(1, "Mode de paiement requis"),
  montant: z.number().positive("Le montant doit être > 0"),
  motif: z.string().min(1, "Le motif est requis").max(500),
  reference: z.string().max(100).optional(),
  justificatif: z.string().optional(),
});

export const declarationCloturSchema = z.object({
  declarations: z.record(
    z.string().min(1),
    z.number().min(0, "Le montant déclaré doit être positif ou nul"),
  ).refine(
    (obj) => Object.keys(obj).length > 0,
    "Au moins un mode de paiement doit être déclaré",
  ),
});

export const validationAveugSchema = z.object({
  declarations: z.record(
    z.string().min(1),
    z.number().min(0, "Le montant déclaré doit être positif ou nul"),
  ).refine(
    (obj) => Object.keys(obj).length > 0,
    "Au moins un mode de paiement doit être déclaré",
  ),
});

export const forceCloseSchema = z.object({
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères").max(1000),
  motDePasse: z.string().min(1, "Le mot de passe est requis pour la ré-authentification"),
});

export const correctiveSessionSchema = z.object({
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères").max(1000),
  motDePasse: z.string().min(1, "Le mot de passe est requis pour la ré-authentification"),
  mouvements: z.array(z.object({
    mode: z.string().min(1, "Mode de paiement requis"),
    montant: z.number({ message: "Le montant est requis" }).refine(v => v !== 0, { message: "Le montant ne peut pas etre 0" }),
    motif: z.string().min(1, "Le motif du mouvement est requis").max(500),
  })).min(1, "Au moins un mouvement correctif requis"),
});

// Schema pour creation de mouvement sur une caisse (sans session)
export const createMouvementCaisseSchema = z.object({
  type: z.enum(TYPE_MOUVEMENT_MANUEL, {
    errorMap: () => ({ message: "Type de mouvement invalide (APPORT, RETRAIT ou DEPENSE)" }),
  }),
  mode: z.string().min(1, "Mode de paiement requis"),
  montant: z.number().positive("Le montant doit etre > 0"),
  motif: z.string().min(1, "Le motif est requis").max(500),
  reference: z.string().max(100).optional(),
  justificatif: z.string().optional(),
});

export type CreateMouvementCaisseInput = z.infer<typeof createMouvementCaisseSchema>;
export type CreateMouvementManuelInput = z.infer<typeof createMouvementManuelSchema>;
export type DeclarationCloturInput = z.infer<typeof declarationCloturSchema>;
export type ValidationAveugInput = z.infer<typeof validationAveugSchema>;
export type ForceCloseInput = z.infer<typeof forceCloseSchema>;
export type CorrectiveSessionInput = z.infer<typeof correctiveSessionSchema>;
