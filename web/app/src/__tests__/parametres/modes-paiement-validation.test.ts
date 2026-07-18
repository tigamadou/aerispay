import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tests pour la validation dynamique des modes de paiement ───
// Les schemas Zod acceptent tout string non-vide pour `mode`.
// La validation metier (le mode existe en base) se fait dans les routes API.

describe("mouvement-caisse schemas accept any non-empty mode string", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("createMouvementManuelSchema accepts CELTIS_CASH", async () => {
    const { createMouvementManuelSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = createMouvementManuelSchema.safeParse({
      sessionId: "sess123",
      type: "APPORT",
      mode: "CELTIS_CASH",
      montant: 5000,
      motif: "Apport Celtis Cash",
    });
    expect(r.success).toBe(true);
  });

  it("createMouvementManuelSchema accepts any custom mode code", async () => {
    const { createMouvementManuelSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = createMouvementManuelSchema.safeParse({
      sessionId: "sess123",
      type: "APPORT",
      mode: "WAVE_SENEGAL",
      montant: 5000,
      motif: "Apport Wave",
    });
    expect(r.success).toBe(true);
  });

  it("createMouvementManuelSchema rejects empty mode", async () => {
    const { createMouvementManuelSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = createMouvementManuelSchema.safeParse({
      sessionId: "sess123",
      type: "APPORT",
      mode: "",
      montant: 5000,
      motif: "Test",
    });
    expect(r.success).toBe(false);
  });

  it("createMouvementCaisseSchema accepts CELTIS_CASH", async () => {
    const { createMouvementCaisseSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = createMouvementCaisseSchema.safeParse({
      type: "APPORT",
      mode: "CELTIS_CASH",
      montant: 5000,
      motif: "Apport Celtis",
    });
    expect(r.success).toBe(true);
  });

  it("createMouvementCaisseSchema rejects empty mode", async () => {
    const { createMouvementCaisseSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = createMouvementCaisseSchema.safeParse({
      type: "APPORT",
      mode: "",
      montant: 5000,
      motif: "Test",
    });
    expect(r.success).toBe(false);
  });

  it("declarationCloturSchema accepts any string key as mode", async () => {
    const { declarationCloturSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = declarationCloturSchema.safeParse({
      declarations: { CELTIS_CASH: 10000, WAVE_SENEGAL: 5000 },
    });
    expect(r.success).toBe(true);
  });

  it("correctiveSessionSchema accepts any string mode in mouvements", async () => {
    const { correctiveSessionSchema } = await import("@/lib/validations/mouvement-caisse");
    const r = correctiveSessionSchema.safeParse({
      motif: "Correction pour ecart Celtis Cash",
      motDePasse: "Admin@1234",
      mouvements: [
        { mode: "CELTIS_CASH", montant: -500, motif: "Correction ecart" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("vente schema accepts any non-empty mode string", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("createVenteSchema accepts CELTIS_CASH as paiement mode", async () => {
    const { createVenteSchema } = await import("@/lib/validations/vente");
    const r = createVenteSchema.safeParse({
      sessionId: "sess123",
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 1000, remise: 0 }],
      paiements: [{ mode: "CELTIS_CASH", montant: 1000 }],
      remise: 0,
    });
    expect(r.success).toBe(true);
  });

  it("createVenteSchema accepts MOBILE_MONEY_MTN", async () => {
    const { createVenteSchema } = await import("@/lib/validations/vente");
    const r = createVenteSchema.safeParse({
      sessionId: "sess123",
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 1000, remise: 0 }],
      paiements: [{ mode: "MOBILE_MONEY_MTN", montant: 1000 }],
      remise: 0,
    });
    expect(r.success).toBe(true);
  });

  it("createVenteSchema rejects empty mode", async () => {
    const { createVenteSchema } = await import("@/lib/validations/vente");
    const r = createVenteSchema.safeParse({
      sessionId: "sess123",
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 1000, remise: 0 }],
      paiements: [{ mode: "", montant: 1000 }],
      remise: 0,
    });
    expect(r.success).toBe(false);
  });

  it("createVenteSchema accepts custom dynamic mode", async () => {
    const { createVenteSchema } = await import("@/lib/validations/vente");
    const r = createVenteSchema.safeParse({
      sessionId: "sess123",
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 1000, remise: 0 }],
      paiements: [{ mode: "WAVE_SENEGAL", montant: 1000 }],
      remise: 0,
    });
    expect(r.success).toBe(true);
  });
});
