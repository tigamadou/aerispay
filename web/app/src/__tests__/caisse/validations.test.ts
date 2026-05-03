import { describe, it, expect } from "vitest";
import {
  createMouvementManuelSchema,
  declarationCloturSchema,
  validationAveugSchema,
  forceCloseSchema,
  correctiveSessionSchema,
} from "@/lib/validations/mouvement-caisse";

describe("createMouvementManuelSchema", () => {
  const valid = {
    sessionId: "sess123",
    type: "APPORT" as const,
    mode: "ESPECES" as const,
    montant: 5000,
    motif: "Apport de monnaie",
  };

  it("accepts valid APPORT", () => {
    expect(createMouvementManuelSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts valid RETRAIT", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, type: "RETRAIT" });
    expect(r.success).toBe(true);
  });

  it("accepts valid DEPENSE with justificatif", () => {
    const r = createMouvementManuelSchema.safeParse({
      ...valid,
      type: "DEPENSE",
      justificatif: "facture-001.pdf",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid type VENTE (not manual)", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, type: "VENTE" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid type FOND_INITIAL (not manual)", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, type: "FOND_INITIAL" });
    expect(r.success).toBe(false);
  });

  it("rejects montant <= 0", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, montant: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects negative montant", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, montant: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects empty motif", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, motif: "" });
    expect(r.success).toBe(false);
  });

  it("rejects missing sessionId", () => {
    const { sessionId: _, ...noSession } = valid;
    const r = createMouvementManuelSchema.safeParse(noSession);
    expect(r.success).toBe(false);
  });

  it("rejects empty mode string", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, mode: "" });
    expect(r.success).toBe(false);
  });

  it("accepts MOBILE_MONEY_MTN mode", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, mode: "MOBILE_MONEY_MTN" });
    expect(r.success).toBe(true);
  });

  it("accepts MOBILE_MONEY_MOOV mode", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, mode: "MOBILE_MONEY_MOOV" });
    expect(r.success).toBe(true);
  });

  it("accepts CELTIS_CASH mode", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, mode: "CELTIS_CASH" });
    expect(r.success).toBe(true);
  });

  it("accepts any dynamic mode string", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, mode: "WAVE_SENEGAL" });
    expect(r.success).toBe(true);
  });

  it("accepts optional reference", () => {
    const r = createMouvementManuelSchema.safeParse({ ...valid, reference: "REF-001" });
    expect(r.success).toBe(true);
  });
});

describe("declarationCloturSchema", () => {
  it("accepts valid declarations", () => {
    const r = declarationCloturSchema.safeParse({
      declarations: { ESPECES: 50000, MOBILE_MONEY_MTN: 12000 },
    });
    expect(r.success).toBe(true);
  });

  it("accepts zero amounts", () => {
    const r = declarationCloturSchema.safeParse({
      declarations: { ESPECES: 0 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty declarations", () => {
    const r = declarationCloturSchema.safeParse({ declarations: {} });
    expect(r.success).toBe(false);
  });

  it("rejects negative amounts", () => {
    const r = declarationCloturSchema.safeParse({
      declarations: { ESPECES: -100 },
    });
    expect(r.success).toBe(false);
  });
});

describe("validationAveugSchema", () => {
  it("accepts valid declarations", () => {
    const r = validationAveugSchema.safeParse({
      declarations: { ESPECES: 49500 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty declarations", () => {
    const r = validationAveugSchema.safeParse({ declarations: {} });
    expect(r.success).toBe(false);
  });
});

describe("forceCloseSchema", () => {
  it("accepts valid force close", () => {
    const r = forceCloseSchema.safeParse({
      motif: "Session abandonnée par le caissier en fin de journée",
      motDePasse: "Admin@1234",
    });
    expect(r.success).toBe(true);
  });

  it("rejects short motif (< 10 chars)", () => {
    const r = forceCloseSchema.safeParse({
      motif: "court",
      motDePasse: "Admin@1234",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing password", () => {
    const r = forceCloseSchema.safeParse({
      motif: "Session abandonnée par le caissier",
    });
    expect(r.success).toBe(false);
  });
});

describe("correctiveSessionSchema", () => {
  it("accepts valid corrective session", () => {
    const r = correctiveSessionSchema.safeParse({
      motif: "Erreur de comptage sur la session du 15 avril",
      motDePasse: "Admin@1234",
      mouvements: [
        { mode: "ESPECES", montant: -500, motif: "Correction écart espèces" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty mouvements array", () => {
    const r = correctiveSessionSchema.safeParse({
      motif: "Correction nécessaire pour erreur",
      motDePasse: "Admin@1234",
      mouvements: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts negative montant (correction sortie)", () => {
    const r = correctiveSessionSchema.safeParse({
      motif: "Correction pour excédent non justifié",
      motDePasse: "Admin@1234",
      mouvements: [
        { mode: "ESPECES", montant: -1000, motif: "Retrait correctif" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects mouvement without motif", () => {
    const r = correctiveSessionSchema.safeParse({
      motif: "Correction nécessaire pour erreur",
      motDePasse: "Admin@1234",
      mouvements: [
        { mode: "ESPECES", montant: 500, motif: "" },
      ],
    });
    expect(r.success).toBe(false);
  });
});
