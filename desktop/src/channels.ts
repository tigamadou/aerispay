/**
 * C2.1 — Canaux IPC du pont périphériques (liste blanche partagée).
 *
 * Module NEUTRE volontairement sans import `electron` : il est consommé à la fois par le
 * main (enregistrement des handlers `ipcMain`) et par le preload (`contextBridge`). Garder
 * cette constante hors de preload.ts évite que le main, en l'important, déclenche l'effet
 * de bord `contextBridge.exposeInMainWorld` (indisponible dans le main process).
 */
export const DEVICE_CHANNELS = {
  printTicket: "aeris:print-ticket",
  openDrawer: "aeris:open-drawer",
  printerStatus: "aeris:printer-status",
} as const;
