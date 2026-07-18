/**
 * Calcule le prochain code terminal disponible au format `P<N>` (P1, P2, …),
 * à partir des codes existants. Les codes hors format (codes parlants comme
 * "BAR", "ENTREE") sont ignorés dans le calcul du maximum.
 *
 * Renvoie `P<max+1>` (ou `P1` si aucun code au format `P<N>`).
 */
export function nextTerminalCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^P(\d+)$/.exec(code);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `P${max + 1}`;
}
