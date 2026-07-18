import { describe, it, expect, vi } from "vitest";

// config-store importe electron (app/safeStorage) pour l'IO ; on le mocke pour pouvoir
// tester les fonctions PURES (encode/decode) en environnement node.
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, "utf8"),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
}));

import { encodeConfigFile, decodeConfigFile } from "../config-store";
import type { PosteConfig } from "../config";

const config: PosteConfig = { nodeUrl: "https://x:3000", terminalId: "c1", codePoste: "P1", nom: "Entrée" };
// faux chiffrement réversible (base64) pour le test
const enc = (s: string) => Buffer.from(s, "utf8").toString("base64");
const dec = (b64: string) => Buffer.from(b64, "base64").toString("utf8");

describe("config-store (purs)", () => {
  it("round-trip encode→decode restitue config + token", () => {
    const raw = encodeConfigFile(config, "secret-token", enc);
    const out = decodeConfigFile(raw, dec);
    expect(out).toEqual({ config, storeToken: "secret-token" });
  });

  it("le token clair n'apparaît pas dans le JSON encodé", () => {
    const raw = encodeConfigFile(config, "secret-token", enc);
    expect(raw).not.toContain("secret-token");
  });

  it("JSON corrompu → null", () => {
    expect(decodeConfigFile("pas du json", dec)).toBeNull();
  });

  it("champ storeTokenEnc absent → null", () => {
    expect(decodeConfigFile(JSON.stringify({ nodeUrl: "x", terminalId: "c1" }), dec)).toBeNull();
  });
});
