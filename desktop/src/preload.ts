/**
 * C2.1 — Preload bridge : expose au renderer une API restreinte (liste blanche) vers
 * le pont périphériques du main, via contextBridge. Le renderer n'a AUCUN accès Node
 * direct (pas de fs/child_process) — durcissement C2.2.
 */
import { contextBridge, ipcRenderer } from "electron";

import { DEVICE_CHANNELS } from "./channels";

contextBridge.exposeInMainWorld("aerisDevices", {
  printTicket: (lines: string[]) => ipcRenderer.invoke(DEVICE_CHANNELS.printTicket, lines),
  openDrawer: () => ipcRenderer.invoke(DEVICE_CHANNELS.openDrawer),
  printerStatus: () => ipcRenderer.invoke(DEVICE_CHANNELS.printerStatus),
});
