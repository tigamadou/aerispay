import { describe, it, expect } from "vitest";
import { nextTerminalCode } from "@/lib/terminaux";

describe("nextTerminalCode", () => {
  it("renvoie P1 quand aucun code n'existe", () => {
    expect(nextTerminalCode([])).toBe("P1");
  });

  it("incrémente le maximum des codes P<N>", () => {
    expect(nextTerminalCode(["P1", "P2"])).toBe("P3");
  });

  it("ignore les codes parlants hors format", () => {
    expect(nextTerminalCode(["P1", "BAR", "ENTREE"])).toBe("P2");
  });

  it("prend max+1 même avec des trous", () => {
    expect(nextTerminalCode(["P1", "P5"])).toBe("P6");
  });

  it("renvoie P1 si aucun code n'est au format P<N>", () => {
    expect(nextTerminalCode(["BAR", "TERRASSE"])).toBe("P1");
  });
});
