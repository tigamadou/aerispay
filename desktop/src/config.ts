/**
 * Configuration d'enrôlement du poste (logique pure, testable).
 * Le premier lancement capture l'URL du nœud et un code d'enrôlement (échangé contre un
 * token de magasin). Le token de magasin va au trousseau OS (jamais ici).
 */

export interface PosteConfig {
  /** URL du nœud magasin sur le LAN (HTTPS recommandé). */
  nodeUrl: string;
  /** Identité de la caisse (poste), résolue à l'échange. */
  caisseId: string;
  /** Code poste (numérotation), retourné par l'échange. */
  codePoste?: string;
  /** Nom lisible de la caisse, retourné par l'échange. */
  nom?: string;
}

export interface EnrollInputResult {
  ok: boolean;
  errors: string[];
  value?: { nodeUrl: string; token: string; nom?: string };
}

/** Valide/normalise la saisie du formulaire d'enrôlement (URL + code + nom). */
export function validateEnrollInput(input: {
  nodeUrl?: string;
  token?: string;
  nom?: string;
}): EnrollInputResult {
  const errors: string[] = [];

  const nodeUrl = (input.nodeUrl ?? "").trim();
  if (!nodeUrl) {
    errors.push("URL du nœud magasin requise");
  } else {
    try {
      const u = new URL(nodeUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        errors.push("URL invalide : protocole http(s) requis");
      }
    } catch {
      errors.push("URL du nœud magasin invalide");
    }
  }

  const token = (input.token ?? "").trim();
  if (!token) errors.push("Code d'enrôlement requis");

  if (errors.length > 0) return { ok: false, errors };

  const nom = (input.nom ?? "").trim();
  return {
    ok: true,
    errors: [],
    value: { nodeUrl: nodeUrl.replace(/\/+$/, ""), token, ...(nom ? { nom } : {}) },
  };
}

/** En-têtes d'authentification présentés au nœud magasin (token scopé poste). */
export function authHeaders(nodeUrl: string, storeToken: string, caisseId: string): Record<string, string> {
  void nodeUrl;
  return {
    Authorization: `Bearer ${storeToken}`,
    "X-Aeris-Caisse": caisseId,
  };
}
