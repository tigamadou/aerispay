import { describe, it, expect } from "vitest";
import { validateEnrollInput, authHeaders } from "../config";

describe("validateEnrollInput", () => {
  it("URL + token valides → ok, URL normalisée (sans slash final)", () => {
    const r = validateEnrollInput({ nodeUrl: "https://magasin.local:3000/", token: "a".repeat(64), nom: " Entrée " });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ nodeUrl: "https://magasin.local:3000", token: "a".repeat(64), nom: "Entrée" });
  });

  it("URL manquante → erreur", () => {
    const r = validateEnrollInput({ token: "a".repeat(64) });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("URL du nœud magasin requise");
  });

  it("protocole non http(s) → erreur", () => {
    const r = validateEnrollInput({ nodeUrl: "ftp://x", token: "a" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("http"))).toBe(true);
  });

  it("token manquant → erreur", () => {
    const r = validateEnrollInput({ nodeUrl: "https://x" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("Code d'enrôlement requis");
  });
});

describe("authHeaders", () => {
  it("compose Authorization + X-Aeris-Caisse", () => {
    expect(authHeaders("https://x", "tok", "c1")).toEqual({
      Authorization: "Bearer tok",
      "X-Aeris-Caisse": "c1",
    });
  });
});
