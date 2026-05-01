import { getSeuil } from "@/lib/services/seuils";

type DiscrepancyCategory = "MINEUR" | "MOYEN" | "MAJEUR";

interface ModeReconciliation {
  mode: string;
  theorique: number;
  declareCaissier: number;
  declareValideur: number;
  montantReference: number; // agreed-upon amount used for final discrepancy
  ecartCaissierValideur: number; // difference between cashier and validator
  ecartFinal: number; // reference - theorique
  categorie: DiscrepancyCategory | null; // null if ecart = 0
}

export type ReconciliationResult =
  | { outcome: "VALIDATED"; modes: ModeReconciliation[]; needsAcceptance: boolean }
  | { outcome: "RECOUNT_NEEDED"; modes: ModeReconciliation[]; reason: string }
  | { outcome: "DISPUTED"; modes: ModeReconciliation[]; reason: string };

/**
 * RULE-RECONC-001 to 004: Reconcile cashier and validator declarations
 * against theoretical balances.
 */
export async function reconcile(
  soldesParMode: Array<{ mode: string; solde: number }>,
  declarationsCaissier: Record<string, number>,
  declarationsValideur: Record<string, number>,
  tentativesRecomptage: number,
): Promise<ReconciliationResult> {
  const seuilMineur = await getSeuil("THRESHOLD_DISCREPANCY_MINOR");
  const seuilMajeur = await getSeuil("THRESHOLD_DISCREPANCY_MAJOR");
  const maxRecount = await getSeuil("THRESHOLD_MAX_RECOUNT_ATTEMPTS");

  const soldesMap = new Map(soldesParMode.map((s) => [s.mode, s.solde]));

  // Collect all modes
  const allModes = new Set([
    ...soldesMap.keys(),
    ...Object.keys(declarationsCaissier),
    ...Object.keys(declarationsValideur),
  ]);

  const modes: ModeReconciliation[] = [];
  let hasSignificantDisagreement = false;

  for (const mode of allModes) {
    const theorique = soldesMap.get(mode) ?? 0;
    const caissier = declarationsCaissier[mode] ?? 0;
    const valideur = declarationsValideur[mode] ?? 0;
    const ecartCV = Math.abs(caissier - valideur);

    let montantReference: number;
    if (ecartCV === 0) {
      // RULE-RECONC-001 / 002: Cashier and validator agree
      montantReference = caissier;
    } else if (ecartCV <= seuilMineur) {
      // RULE-RECONC-003: Minor disagreement — take average
      montantReference = Math.round((caissier + valideur) / 2);
    } else {
      // RULE-RECONC-004: Significant disagreement
      hasSignificantDisagreement = true;
      montantReference = caissier; // placeholder, won't be used
    }

    const ecartFinal = montantReference - theorique;
    const absEcart = Math.abs(ecartFinal);

    let categorie: DiscrepancyCategory | null = null;
    if (absEcart > 0) {
      if (absEcart <= seuilMineur) {
        categorie = "MINEUR";
      } else if (absEcart <= seuilMajeur) {
        categorie = "MOYEN";
      } else {
        categorie = "MAJEUR";
      }
    }

    modes.push({
      mode,
      theorique,
      declareCaissier: caissier,
      declareValideur: valideur,
      montantReference,
      ecartCaissierValideur: ecartCV,
      ecartFinal,
      categorie,
    });
  }

  // RULE-RECONC-004: Significant disagreement
  if (hasSignificantDisagreement) {
    if (tentativesRecomptage >= maxRecount) {
      return {
        outcome: "DISPUTED",
        modes,
        reason: `Désaccord significatif après ${tentativesRecomptage} tentative(s) de recomptage`,
      };
    }
    return {
      outcome: "RECOUNT_NEEDED",
      modes,
      reason: "Écart significatif entre les déclarations du caissier et du valideur",
    };
  }

  // Check if acceptance is needed (MOYEN or MAJEUR discrepancy)
  const needsAcceptance = modes.some(
    (m) => m.categorie === "MOYEN" || m.categorie === "MAJEUR",
  );

  return { outcome: "VALIDATED", modes, needsAcceptance };
}

export function categorizeDiscrepancy(
  ecart: number,
  seuilMineur: number,
  seuilMajeur: number,
): DiscrepancyCategory | null {
  const abs = Math.abs(ecart);
  if (abs === 0) return null;
  if (abs <= seuilMineur) return "MINEUR";
  if (abs <= seuilMajeur) return "MOYEN";
  return "MAJEUR";
}
