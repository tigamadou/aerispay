/**
 * C2.1 — Canaux IPC (source de vérité pour le MAIN process).
 *
 * ⚠ Les **preloads** (sandbox:true) NE doivent PAS importer ce module : un preload sandboxé
 * ne peut `require()` que 'electron' et les built-ins Node — pas un module local. Les canaux
 * y sont donc **inlinés** (voir `preload.ts` / `enroll-preload.ts`). Garder les valeurs en phase.
 * Ici, pas d'import `electron` : ce module est neutre, importé par le main pour `ipcMain.handle`.
 */
export const DEVICE_CHANNELS = {
  printTicket: "aeris:print-ticket",
  openDrawer: "aeris:open-drawer",
  printerStatus: "aeris:printer-status",
} as const;

// Canal d'enrôlement (fenêtre locale d'enrôlement → main).
export const ENROLL_CHANNELS = {
  submit: "aeris:enroll-submit",
} as const;
