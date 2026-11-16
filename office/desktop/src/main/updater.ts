import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { UPDATE_ACTION_CHANNEL, UPDATE_EVENT_CHANNEL, type UpdateAction, type UpdateEvent } from "../shared/ipc";

/**
 * In-app updates (Windows), the same behaviour as Aromex desktop:
 *  - 15 s after start, then every 4 hours, it quietly checks the releases repo
 *    (electron-builder.yml → publish). A failed check (offline…) shows nothing.
 *  - A newer version is OFFERED (pop-up with the release notes), never forced; it downloads
 *    only on "Update now", in the background, with progress.
 *  - Downloaded: "Restart now" installs and reopens, or it installs when the app is next closed.
 *  - A failed download: the error and "Open download page" (install by hand).
 * Off in development (not packaged). Only a HIGHER version than package.json's is offered.
 */
const RELEASES_PAGE = "https://github.com/Humble-Coders/TechnoFluid-2026-exe/releases/latest";
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/** GitHub sends release notes as HTML: plain text, about 800 characters at most, null when empty. */
function notesOf(info: UpdateInfo): string | null {
  const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note ?? "").join("\n") : (info.releaseNotes ?? "");
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > 800 ? `${text.slice(0, 800).trimEnd()}…` : text;
}

export function startUpdates(getWindow: () => BrowserWindow | null): void {
  // Windows only (the Mac build isn't notarised, so it can't update itself yet).
  if (!app.isPackaged || process.platform !== "win32") return;

  autoUpdater.autoDownload = false; // offer first; download only on "Update now"
  autoUpdater.autoInstallOnAppQuit = true; // downloaded but not restarted → installs at the next quit
  autoUpdater.logger = null;

  let latest: UpdateEvent | null = null; // the last "available" / "downloaded", re-sent to a window that reloads
  let asked = false; // errors are shown only after the person pressed "Update now"

  const send = (event: UpdateEvent) => {
    if (event.kind === "available" || event.kind === "downloaded") latest = event;
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(UPDATE_EVENT_CHANNEL, event);
  };

  autoUpdater.on("update-available", (info) => send({ kind: "available", version: info.version, notes: notesOf(info) }));
  autoUpdater.on("download-progress", (p) => send({ kind: "progress", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => send({ kind: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => {
    if (asked) send({ kind: "error", message: err?.message ? String(err.message).split("\n")[0]! : "The update couldn't be downloaded." });
    asked = false;
  });

  ipcMain.handle(UPDATE_ACTION_CHANNEL, async (event, action: UpdateAction) => {
    if (event.senderFrame !== getWindow()?.webContents.mainFrame) return; // only our own window
    if (action === "download") {
      asked = true;
      await autoUpdater.downloadUpdate().catch(() => undefined); // the "error" event reports it
    } else if (action === "install") {
      setImmediate(() => autoUpdater.quitAndInstall());
    } else if (action === "openPage") {
      await shell.openExternal(RELEASES_PAGE);
    }
  });

  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);

  app.on("browser-window-created", (_e, win) =>
    win.webContents.on("did-finish-load", () => {
      if (latest) win.webContents.send(UPDATE_EVENT_CHANNEL, latest);
    }),
  );
}
