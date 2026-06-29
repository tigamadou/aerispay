import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";

import type { PosteConfig } from "./config";

interface ConfigFile {
  nodeUrl: string;
  caisseId: string;
  codePoste?: string;
  nom?: string;
  /** Token de magasin chiffré (safeStorage) en base64. */
  storeTokenEnc: string;
}

/** Sérialise config + token chiffré (logique pure : fonction de chiffrement injectée). */
export function encodeConfigFile(config: PosteConfig, storeToken: string, encrypt: (s: string) => string): string {
  const file: ConfigFile = {
    nodeUrl: config.nodeUrl,
    caisseId: config.caisseId,
    codePoste: config.codePoste,
    nom: config.nom,
    storeTokenEnc: encrypt(storeToken),
  };
  return JSON.stringify(file, null, 2);
}

/** Désérialise (logique pure : fonction de déchiffrement injectée). null si invalide. */
export function decodeConfigFile(
  raw: string,
  decrypt: (b64: string) => string,
): { config: PosteConfig; storeToken: string } | null {
  let parsed: Partial<ConfigFile>;
  try {
    parsed = JSON.parse(raw) as Partial<ConfigFile>;
  } catch {
    return null;
  }
  if (!parsed.nodeUrl || !parsed.caisseId || !parsed.storeTokenEnc) return null;
  return {
    config: { nodeUrl: parsed.nodeUrl, caisseId: parsed.caisseId, codePoste: parsed.codePoste, nom: parsed.nom },
    storeToken: decrypt(parsed.storeTokenEnc),
  };
}

function configPath(): string {
  return path.join(app.getPath("userData"), "poste-config.json");
}

/** Indique si le chiffrement par trousseau OS est disponible (à vérifier AVANT l'échange). */
export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function loadConfig(): { config: PosteConfig; storeToken: string } | null {
  const p = configPath();
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf8");
  return decodeConfigFile(raw, (b64) => safeStorage.decryptString(Buffer.from(b64, "base64")));
}

export function saveConfig(config: PosteConfig, storeToken: string): void {
  const raw = encodeConfigFile(config, storeToken, (s) => safeStorage.encryptString(s).toString("base64"));
  writeFileSync(configPath(), raw, { encoding: "utf8", mode: 0o600 });
}

export function clearConfig(): void {
  const p = configPath();
  if (existsSync(p)) rmSync(p);
}
