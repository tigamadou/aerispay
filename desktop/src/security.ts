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
 * CSP stricte : ressources limitées à l'origine du nœud ; pas d'inline script ;
 * connexions (XHR/WebSocket) limitées au nœud.
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
    `script-src 'self' ${o}`,
    `style-src 'self' 'unsafe-inline' ${o}`,
    `img-src 'self' data: ${o}`,
    `connect-src 'self' ${o}`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
  ].join("; ");
}
