import { describe, it, expect } from "vitest";
import { cn, formatMontant, formatDate, formatDateTime, genererNumeroVente, genererReference } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });
  it("filters falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });
});

describe("formatMontant", () => {
  it("formats integer amount in FCFA", () => {
    const result = formatMontant(51679);
    expect(result).toContain("51");
    expect(result).toContain("679");
    expect(result).toContain("FCFA");
  });
  it("rounds to integer", () => {
    const result = formatMontant(1234.56);
    expect(result).toContain("1 235");
  });
  it("uses custom currency", () => {
    expect(formatMontant(100, "EUR")).toContain("EUR");
  });
  it("handles zero", () => {
    expect(formatMontant(0)).toContain("0");
  });
});

describe("formatDate", () => {
  it("formats date as DD/MM/YYYY", () => {
    const result = formatDate(new Date("2026-04-23T00:00:00"));
    expect(result).toBe("23/04/2026");
  });
  it("accepts string input", () => {
    const result = formatDate("2026-01-15");
    expect(result).toContain("2026");
  });
});

describe("formatDateTime", () => {
  it("formats datetime with time", () => {
    const result = formatDateTime(new Date("2026-04-23T14:35:00"));
    expect(result).toContain("23/04/2026");
    expect(result).toContain("14:35");
  });
  it("accepts string input", () => {
    const result = formatDateTime("2026-04-23T14:35:00");
    expect(result).toContain("2026");
  });
});

describe("genererNumeroVente", () => {
  it("generates sequential sale number", () => {
    const result = genererNumeroVente(42);
    expect(result).toMatch(/^VTE-\d{4}-00042$/);
  });
  it("pads to 5 digits", () => {
    expect(genererNumeroVente(1)).toMatch(/-00001$/);
    expect(genererNumeroVente(99999)).toMatch(/-99999$/);
  });
});

describe("genererReference", () => {
  it("generates PRD-XXXXX format", () => {
    const result = genererReference();
    expect(result).toMatch(/^PRD-[A-Z0-9]{5}$/);
  });
  it("generates unique values", () => {
    const refs = new Set(Array.from({ length: 10 }, genererReference));
    expect(refs.size).toBe(10);
  });
});
