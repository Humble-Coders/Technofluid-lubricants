import { contextBridge, ipcRenderer } from "electron";
import type { OfficeBridge } from "../shared/ipc";

/**
 * The only door between the screens and the computer. Each method maps to one
 * `ipcMain.handle` in the main process; nothing else from Electron or Node is exposed.
 */
const office: OfficeBridge = {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke("app:info"),
};

contextBridge.exposeInMainWorld("office", office);
