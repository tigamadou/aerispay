/**
 * Shared label maps for payment modes and session/sale statuses.
 * Import these instead of redefining locally in each page/component.
 */

// ─── Mode de paiement ─────────────────────────────────

export const modeLabel: Record<string, string> = {
  ESPECES: "Cash",
  MOBILE_MONEY: "Mobile Money",
  MOBILE_MONEY_MTN: "MomoPay",
  MOBILE_MONEY_MOOV: "MoovMoney",
  CELTIS_CASH: "Celtis Cash",
};

// ─── Statut session ───────────────────────────────────

export const statutSessionLabel: Record<string, string> = {
  OUVERTE: "Ouverte",
  FERMEE: "Fermee",
  EN_ATTENTE_CLOTURE: "En attente de cloture",
  EN_ATTENTE_VALIDATION: "En attente de validation",
  VALIDEE: "Validee",
  CONTESTEE: "Contestee",
  FORCEE: "Forcee",
  CORRIGEE: "Corrigee",
};

export const statutSessionColor: Record<string, string> = {
  OUVERTE: "bg-green-100 text-green-800",
  EN_ATTENTE_CLOTURE: "bg-yellow-100 text-yellow-800",
  EN_ATTENTE_VALIDATION: "bg-orange-100 text-orange-800",
  VALIDEE: "bg-blue-100 text-blue-800",
  CONTESTEE: "bg-red-100 text-red-800",
  FORCEE: "bg-zinc-200 text-zinc-800",
  CORRIGEE: "bg-purple-100 text-purple-800",
  FERMEE: "bg-zinc-100 text-zinc-600",
};

// ─── Statut vente ─────────────────────────────────────

export const statutVenteLabel: Record<string, { text: string; className: string }> = {
  VALIDEE: {
    text: "Validee",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  ANNULEE: {
    text: "Annulee",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  REMBOURSEE: {
    text: "Remboursee",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
};

// ─── Type mouvement de caisse ─────────────────────────

export const typeMouvementCaisseLabel: Record<string, string> = {
  FOND_INITIAL: "Fond initial",
  VENTE: "Vente",
  REMBOURSEMENT: "Remboursement",
  APPORT: "Apport",
  RETRAIT: "Retrait",
  DEPENSE: "Depense",
  CORRECTION: "Correction",
};
