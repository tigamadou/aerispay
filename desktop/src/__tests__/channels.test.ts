import { describe, it, expect } from "vitest";
import { DEVICE_CHANNELS } from "../channels";

/**
 * C2.1 — La liste blanche des canaux IPC doit vivre dans un module NEUTRE, importable
 * à la fois par le main et par le preload, SANS effet de bord Electron. Régression :
 * quand DEVICE_CHANNELS était défini dans preload.ts, l'import par main.ts déclenchait
 * `contextBridge.exposeInMainWorld` dans le main process (contextBridge undefined) →
 * crash « Cannot read properties of undefined (reading 'exposeInMainWorld') ».
 */
describe("C2.1 — canaux IPC partagés (module neutre)", () => {
  it("expose les canaux périphériques attendus", () => {
    expect(DEVICE_CHANNELS).toEqual({
      printTicket: "aeris:print-ticket",
      openDrawer: "aeris:open-drawer",
      printerStatus: "aeris:printer-status",
    });
  });

  it("est importable sans dépendre d'Electron (aucun effet de bord)", async () => {
    // Si le module tirait `electron`, cet import dynamique throw hors runtime Electron.
    await expect(import("../channels")).resolves.toBeDefined();
  });
});
