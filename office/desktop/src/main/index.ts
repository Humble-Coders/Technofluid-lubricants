import { app, BrowserWindow, ipcMain, Menu, screen, session, shell } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppInfo } from "../shared/ipc";

/**
 * Electron main process. Deliberately small: it owns the window and a short list of
 * things the screens are allowed to ask the computer for (app info today; print/PDF
 * and updates later). All business logic lives in the renderer + Cloud Functions.
 *
 * Security posture (Electron's own checklist):
 *  - contextIsolation + sandbox on, nodeIntegration off — screen code cannot touch Node.
 *  - Only the preload's tiny `window.office` API crosses the boundary.
 *  - No new windows, no navigating away from the app, no device permissions.
 *  - Links to the web open in the real browser, https only.
 */

const isDev = !app.isPackaged;
const isMac = process.platform === "darwin";

// One copy of the app per computer — two copies would double every Firestore listener.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

// ─── Window size & position remembered between launches ────────────────────────

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const stateFile = (): string => join(app.getPath("userData"), "window-state.json");

function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1360, height: 860, maximized: false };
  try {
    if (!existsSync(stateFile())) return fallback;
    const saved = JSON.parse(readFileSync(stateFile(), "utf8")) as WindowState;
    // Only restore a position that is still on a connected display.
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x !== undefined && saved.y !== undefined &&
      saved.x >= a.x - 50 && saved.y >= a.y - 50 &&
      saved.x < a.x + a.width && saved.y < a.y + a.height,
    );
    return onScreen ? saved : { ...fallback, maximized: saved.maximized };
  } catch {
    return fallback;
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds();
    const state: WindowState = { ...bounds, maximized: win.isMaximized() };
    writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // Losing the remembered size is harmless; never crash on it.
  }
}

// ─── Window ────────────────────────────────────────────────────────────────────

function createWindow(): void {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: "Technofluid Office",
    backgroundColor: "#f6f7f9",
    // Native-feeling chrome: traffic lights inset on Mac, overlay buttons on Windows.
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    titleBarOverlay: isMac ? undefined : { color: "#ffffff", symbolColor: "#2B2B2B", height: 44 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", () => mainWindow && saveWindowState(mainWindow));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Never open a second Electron window; send http(s) links to the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  // The app never navigates away from itself.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev && process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL);
    if (!allowed) event.preventDefault();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ─── App menu (keeps Cmd/Ctrl+C, V, Z working; no developer items in production) ─

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        ...(isDev
          ? ([{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }] as const)
          : []),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── What the screens may ask for ────────────────────────────────────────────────

function registerIpc(): void {
  ipcMain.handle("app:info", (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  // No camera, microphone, notifications, geolocation… unless we deliberately add one.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  if (!isDev) {
    // Strict content policy in the shipped app: only our own code, Firebase and Google APIs.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app",
              "frame-src 'none'",
              "object-src 'none'",
            ].join("; "),
          ],
        },
      });
    });
  }

  registerIpc();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
