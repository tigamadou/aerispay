/**
 * C2.2 — Durcissement du client Electron (logique pure, testable).
 * Options de BrowserWindow sécurisées, liste blanche de navigation (origine du nœud
 * magasin uniquement), et construction de la CSP stricte.
 */

export interface SecureWindowOptions {
  contextIsolation: true;
  nodeIntegration: false;
  sandbox: true;
  webSecurity: true;
}

/** Options durcies imposées à toute BrowserShell (jamais surchargeables vers le bas). */
export function secureWebPreferences(): SecureWindowOptions {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
}

/**
 * Navigation restreinte à l'origine du nœud magasin. Toute autre origine est refusée
 * (anti-exfiltration / anti-phishing dans la coquille kiosque).
 */
export function isAllowedNavigation(targetUrl: string, nodeOrigin: string): boolean {
  let target: URL;
  let node: URL;
  try {
    target = new URL(targetUrl);
    node = new URL(nodeOrigin);
  } catch {
    return false;
  }
  return target.origin === node.origin;
}

/**
 * CSP du kiosque : ressources limitées à l'origine du nœud (navigation déjà verrouillée
 * sur cette origine). `script-src` autorise `'unsafe-inline'` et `'unsafe-eval'` car Next.js
 * en a besoin (scripts inline d'hydratation + `eval` de Turbopack en dev) — sans quoi la page
 * ne s'hydrate pas et les formulaires retombent en soumission GET native. `connect-src` inclut
 * `ws:`/`wss:` pour le HMR en dev. Compromis acceptable : la coquille ne charge QUE le nœud LAN
 * de confiance et ne peut naviguer ailleurs (cf. isAllowedNavigation).
 */
export function buildCsp(nodeOrigin: string): string {
  const o = (() => {
    try {
      return new URL(nodeOrigin).origin;
    } catch {
      return "'none'";
    }
  })();
  return [
    `default-src 'self' ${o}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${o}`,
    `style-src 'self' 'unsafe-inline' ${o}`,
    `img-src 'self' data: blob: ${o}`,
    `font-src 'self' data: ${o}`,
    `connect-src 'self' ${o} ws: wss:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
  ].join("; ");
}
