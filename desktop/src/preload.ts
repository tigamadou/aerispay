/**
 * C2.1 — Preload bridge : expose au renderer une API restreinte (liste blanche) vers
 * le pont périphériques du main, via contextBridge. Le renderer n'a AUCUN accès Node
 * direct (pas de fs/child_process) — durcissement C2.2.
 */
import { contextBridge, ipcRenderer } from "electron";

// Liste blanche des canaux IPC autorisés — toute autre invocation est impossible.
const DEVICE_CHANNELS = {
  printTicket: "aeris:print-ticket",
  openDrawer: "aeris:open-drawer",
  printerStatus: "aeris:printer-status",
} as const;

contextBridge.exposeInMainWorld("aerisDevices", {
  printTicket: (lines: string[]) => ipcRenderer.invoke(DEVICE_CHANNELS.printTicket, lines),
  openDrawer: () => ipcRenderer.invoke(DEVICE_CHANNELS.openDrawer),
  printerStatus: () => ipcRenderer.invoke(DEVICE_CHANNELS.printerStatus),
});

export { DEVICE_CHANNELS };
