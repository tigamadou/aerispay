/**
 * Process principal Electron du client caisse AerisPay.
 * - Premier lancement sans config → fenêtre d'enrôlement (locale, preload aerisEnroll).
 * - Config présente → fenêtre kiosque (UI distante du nœud, preload aerisDevices).
 * - Health-check continu + écran de blocage (ADR-001 : pas de mode dégradé).
 * - Menu « Réinitialiser l'enrôlement ».
 */
import { app, BrowserWindow, ipcMain, session, shell, Menu } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

import { secureWebPreferences, isAllowedNavigation, buildCsp } from "./security";
import { DEVICE_CHANNELS, ENROLL_CHANNELS } from "./channels";
import { printTicket, openDrawer } from "./devices";
import { loadConfig, saveConfig, clearConfig, isSecureStorageAvailable } from "./config-store";
import { validateEnrollInput } from "./config";
import { exchangeEnrollment, type ExchangeResult } from "./enrollment-client";
import type { EnrollInput } from "./enroll-preload";

const HEALTH_INTERVAL_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let nodeUrl = process.env.AERIS_NODE_URL ?? "";
let nodeAvailable = false;
let healthTimer: NodeJS.Timeout | null = null;

async function checkNodeHealth(): Promise<boolean> {
  if (!nodeUrl) return false;
  try {
    const res = await fetch(`${nodeUrl}/api/health`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function applyCsp(win: BrowserWindow) {
  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [buildCsp(nodeUrl)] } });
  });
}

function restrictNavigation(win: BrowserWindow) {
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, nodeUrl)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedNavigation(url, nodeUrl)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

function clearHealthTimer() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

async function renderState(win: BrowserWindow) {
  nodeAvailable = await checkNodeHealth();
  if (nodeAvailable) {
    await win.loadURL(nodeUrl);
  } else {
    await win.loadFile(path.join(__dirname, "..", "renderer", "blocked.html"));
  }
}

/** Fenêtre d'enrôlement (locale, preload isolé). */
function createEnrollWindow() {
  clearHealthTimer();
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: process.env.AERIS_KIOSK === "true",
    webPreferences: { ...secureWebPreferences(), preload: path.join(__dirname, "enroll-preload.js") },
  });
  void mainWindow.loadFile(path.join(__dirname, "..", "renderer", "config.html"));
}

/** Fenêtre kiosque (UI distante du nœud). */
function createKioskWindow() {
  clearHealthTimer();
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: process.env.AERIS_KIOSK === "true",
    webPreferences: { ...secureWebPreferences(), preload: path.join(__dirname, "preload.js") },
  });
  applyCsp(mainWindow);
  restrictNavigation(mainWindow);
  void renderState(mainWindow);
  healthTimer = setInterval(async () => {
    if (!mainWindow) return;
    const ok = await checkNodeHealth();
    if (ok !== nodeAvailable) await renderState(mainWindow);
  }, HEALTH_INTERVAL_MS);
}

/** Décide de l'écran de départ selon la présence d'une config. */
function bootstrap() {
  const stored = loadConfig();
  if (stored) {
    nodeUrl = process.env.AERIS_NODE_URL ?? stored.config.nodeUrl;
    createKioskWindow();
  } else {
    createEnrollWindow();
  }
}

/** Handler de soumission du formulaire d'enrôlement. */
async function handleEnrollSubmit(_e: unknown, input: EnrollInput): Promise<ExchangeResult> {
  const validated = validateEnrollInput(input);
  if (!validated.ok || !validated.value) {
    return { ok: false, error: validated.errors[0] ?? "Saisie invalide" };
  }
  // Ne pas brûler le code si l'on ne pourra pas stocker le résultat.
  if (!isSecureStorageAvailable()) {
    return { ok: false, error: "Trousseau OS indisponible — enrôlement impossible" };
  }
  const { nodeUrl: url, token, nom } = validated.value;
  const result = await exchangeEnrollment(url, token, nom);
  if (!result.ok) return result;

  saveConfig(
    { nodeUrl: url, caisseId: result.caisseId, codePoste: result.codePoste, nom: result.nom },
    result.storeToken,
  );
  nodeUrl = process.env.AERIS_NODE_URL ?? url;
  setImmediate(() => createKioskWindow());
  return result;
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "AerisPay",
      submenu: [
        {
          label: "Réinitialiser l'enrôlement",
          click: () => {
            clearConfig();
            nodeUrl = process.env.AERIS_NODE_URL ?? "";
            createEnrollWindow();
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    // Menu Édition standard : restaure Couper/Copier/Coller/Tout sélectionner et
    // leurs raccourcis (Cmd+V / Ctrl+V). Sans lui, le menu applicatif custom écrase
    // les défauts et le collage ne fonctionne pas dans les champs (ex. formulaire d'enrôlement).
    { role: "editMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerDeviceBridge() {
  ipcMain.handle(DEVICE_CHANNELS.printTicket, (_e, lines: string[]) => printTicket(lines));
  ipcMain.handle(DEVICE_CHANNELS.openDrawer, () => openDrawer());
  ipcMain.handle(DEVICE_CHANNELS.printerStatus, () => ({ nodeAvailable }));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  registerDeviceBridge();
  ipcMain.handle(ENROLL_CHANNELS.submit, handleEnrollSubmit);
  buildMenu();
  bootstrap();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) bootstrap();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
