import { describe, it, expect } from "vitest";
import { secureWebPreferences, isAllowedNavigation, buildCsp } from "../security";

describe("C2.2 — durcissement Electron", () => {
  it("impose des webPreferences sécurisées", () => {
    expect(secureWebPreferences()).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });

  it("autorise la navigation vers l'origine du nœud uniquement", () => {
    const node = "https://magasin.local:3000";
    expect(isAllowedNavigation("https://magasin.local:3000/comptoir", node)).toBe(true);
    expect(isAllowedNavigation("https://evil.example.com/", node)).toBe(false);
    expect(isAllowedNavigation("file:///etc/passwd", node)).toBe(false);
    expect(isAllowedNavigation("pas-une-url", node)).toBe(false);
  });

  it("construit une CSP stricte limitée au nœud (pas d'object, frame-ancestors none)", () => {
    const csp = buildCsp("https://magasin.local:3000");
    expect(csp).toContain("default-src 'self' https://magasin.local:3000");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://magasin.local:3000");
  });
});
