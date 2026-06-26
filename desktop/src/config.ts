/**
 * E3.3 — Configuration d'enrôlement du poste (logique pure, testable).
 * Le premier lancement capture l'URL du nœud magasin et le token de magasin (émis par
 * `POST /api/enrollment`, E3.1). Le token est destiné au trousseau OS (E3.2) — jamais
 * en clair dans un fichier. Ce module valide/normalise la configuration.
 */

export interface PosteConfig {
  /** URL du nœud magasin sur le LAN (HTTPS recommandé). */
  nodeUrl: string;
  /** Token de magasin scoppé à la caisse (stocké dans le trousseau OS). */
  storeToken: string;
  /** Identité de la caisse (poste), fixée à l'enrôlement. */
  caisseId: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  config?: PosteConfig;
}

/** Valide et normalise une configuration de poste saisie au premier lancement. */
export function validatePosteConfig(input: Partial<PosteConfig>): ValidationResult {
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

  const storeToken = (input.storeToken ?? "").trim();
  if (!storeToken) errors.push("Token de magasin requis");

  const caisseId = (input.caisseId ?? "").trim();
  if (!caisseId) errors.push("caisseId (identité du poste) requis");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    config: { nodeUrl: nodeUrl.replace(/\/+$/, ""), storeToken, caisseId },
  };
}

/** En-têtes d'authentification présentés au nœud magasin (token scoppé poste). */
export function authHeaders(config: PosteConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.storeToken}`,
    "X-Aeris-Caisse": config.caisseId,
  };
}
