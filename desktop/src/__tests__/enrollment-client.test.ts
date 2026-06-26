import { describe, it, expect, vi } from "vitest";
import { exchangeEnrollment } from "../enrollment-client";

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("exchangeEnrollment", () => {
  it("200 → ok avec storeToken + identité", async () => {
    const f = fakeFetch(200, { data: { storeToken: "s".repeat(64), caisseId: "c1", codePoste: "P1", nom: "Entrée" } });
    const r = await exchangeEnrollment("https://x:3000", "a".repeat(64), "Entrée", f);
    expect(r).toEqual({ ok: true, storeToken: "s".repeat(64), caisseId: "c1", codePoste: "P1", nom: "Entrée" });
    expect(f).toHaveBeenCalledWith("https://x:3000/api/enrollment/exchange", expect.objectContaining({ method: "POST" }));
  });

  it("401 → erreur invalide", async () => {
    const r = await exchangeEnrollment("https://x", "a", undefined, fakeFetch(401, { error: "Code d'enrôlement invalide ou expiré" }));
    expect(r).toEqual({ ok: false, error: "Code d'enrôlement invalide ou expiré" });
  });

  it("422 → erreur caisse", async () => {
    const r = await exchangeEnrollment("https://x", "a", undefined, fakeFetch(422, { error: "Caisse inactive — contactez l'administrateur" }));
    expect(r.ok).toBe(false);
  });

  it("réseau KO → erreur réseau", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const r = await exchangeEnrollment("https://x", "a", undefined, f);
    expect(r).toEqual({ ok: false, error: "Serveur injoignable à cette adresse" });
  });
});
