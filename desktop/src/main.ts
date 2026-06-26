/**
 * Process principal Electron du client caisse AerisPay.
 * - C2.2 : coquille durcie (contextIsolation/sandbox/CSP/navigation restreinte).
 * - C2.3 : health-check continu du nœud ; écran de blocage si indisponible (pas de mode dégradé).
 * - C2.1 : pont périphériques (IPC printTicket/openDrawer).
 * - P5.2 : auto-update (electron-updater).
 *
 * AUCUNE base de données ni logique métier ici : toute la donnée vient du nœud magasin.
 */
import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

import { secureWebPreferences, isAllowedNavigation, buildCsp } from "./security";
import { DEVICE_CHANNELS } from "./preload";
import { printTicket, openDrawer } from "./devices";

const NODE_URL = process.env.AERIS_NODE_URL ?? "http://localhost:3000";
const HEALTH_INTERVAL_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let nodeAvailable = false;

async function checkNodeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${NODE_URL}/api/health`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function applyCsp(win: BrowserWindow) {
  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [buildCsp(NODE_URL)],
      },
    });
  });
}

function restrictNavigation(win: BrowserWindow) {
  // C2.2 — navigation limitée à l'origine du nœud ; pas de nouvelle fenêtre.
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, NODE_URL)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Ouvre les liens externes éventuels dans le navigateur système, jamais dans la coquille.
    if (!isAllowedNavigation(url, NODE_URL)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

async function renderState(win: BrowserWindow) {
  nodeAvailable = await checkNodeHealth();
  if (nodeAvailable) {
    await win.loadURL(NODE_URL);
  } else {
    // C2.3 — écran de blocage explicite, aucune vente possible.
    await win.loadFile(path.join(__dirname, "..", "renderer", "blocked.html"));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: process.env.AERIS_KIOSK === "true",
    webPreferences: {
      ...secureWebPreferences(),
      preload: path.join(__dirname, "preload.js"),
    },
  });

  applyCsp(mainWindow);
  restrictNavigation(mainWindow);
  void renderState(mainWindow);

  // Boucle de health-check : rebascule entre UI et écran de blocage.
  setInterval(async () => {
    if (!mainWindow) return;
    const ok = await checkNodeHealth();
    if (ok !== nodeAvailable) await renderState(mainWindow);
  }, HEALTH_INTERVAL_MS);
}

function registerDeviceBridge() {
  // C2.1 — handlers IPC du pont périphériques (liste blanche définie dans preload).
  ipcMain.handle(DEVICE_CHANNELS.printTicket, (_e, lines: string[]) => printTicket(lines));
  ipcMain.handle(DEVICE_CHANNELS.openDrawer, () => openDrawer());
  ipcMain.handle(DEVICE_CHANNELS.printerStatus, () => ({ nodeAvailable }));
}

app.whenReady().then(() => {
  // Durcissement supplémentaire : refuse toute permission renderer (caméra, etc.).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  registerDeviceBridge();
  createWindow();

  // P5.2 — auto-update (binaires signés + flux de mise à jour).
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
