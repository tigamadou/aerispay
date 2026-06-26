/**
 * C2.1 — Preload bridge : expose au renderer une API restreinte (liste blanche) vers
 * le pont périphériques du main, via contextBridge. Le renderer n'a AUCUN accès Node
 * direct (pas de fs/child_process) — durcissement C2.2.
 */
import { contextBridge, ipcRenderer } from "electron";

// Preload SANDBOXÉ : pas de require() local (cf. enroll-preload). Canaux inlinés —
// miroir de src/channels.ts → DEVICE_CHANNELS. Garder les deux en phase.
const PRINT_TICKET = "aeris:print-ticket";
const OPEN_DRAWER = "aeris:open-drawer";
const PRINTER_STATUS = "aeris:printer-status";

contextBridge.exposeInMainWorld("aerisDevices", {
  printTicket: (lines: string[]) => ipcRenderer.invoke(PRINT_TICKET, lines),
  openDrawer: () => ipcRenderer.invoke(OPEN_DRAWER),
  printerStatus: () => ipcRenderer.invoke(PRINTER_STATUS),
});
