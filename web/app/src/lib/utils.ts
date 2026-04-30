/**
 * Utility to conditionally join class names.
 * Filters out falsy values and joins the rest with a space.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

/**
 * Format a numeric amount as FCFA currency string.
 * No decimals — FCFA is an integer currency.
 */
export function formatMontant(montant: number, devise = "FCFA"): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(Number(montant))).replace(/\u202F/g, " ")} ${devise}`;
}

/**
 * Format a date as DD/MM/YYYY.
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Format a datetime as DD/MM/YYYY à HH:MM.
 */
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Generate a sequential sale number.
 */
export function genererNumeroVente(sequence: number): string {
  return `VTE-${new Date().getFullYear()}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Generate a random product reference.
 */
export function genererReference(): string {
  return `PRD-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}
