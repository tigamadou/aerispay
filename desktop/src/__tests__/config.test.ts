import { describe, it, expect } from "vitest";
import { validatePosteConfig, authHeaders } from "../config";

describe("E3.3 — configuration d'enrôlement du poste", () => {
  it("valide une config complète et normalise l'URL (sans slash final)", () => {
    const r = validatePosteConfig({
      nodeUrl: "https://magasin.local:3000/",
      storeToken: "a".repeat(64),
      caisseId: "caisse-1",
    });
    expect(r.ok).toBe(true);
    expect(r.config?.nodeUrl).toBe("https://magasin.local:3000");
    expect(r.config?.caisseId).toBe("caisse-1");
  });

  it("rejette une URL invalide", () => {
    const r = validatePosteConfig({ nodeUrl: "ftp://x", storeToken: "t", caisseId: "c" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/protocole|invalide/i);
  });

  it("liste toutes les erreurs sur config vide", () => {
    const r = validatePosteConfig({});
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(3);
  });

  it("construit les en-têtes d'auth scoppés poste", () => {
    const h = authHeaders({ nodeUrl: "https://x", storeToken: "tok", caisseId: "caisse-1" });
    expect(h.Authorization).toBe("Bearer tok");
    expect(h["X-Aeris-Caisse"]).toBe("caisse-1");
  });
});
