import { contextBridge, ipcRenderer } from "electron";
import type { OfficeBridge } from "../shared/ipc";

/**
 * The only door between the screens and the computer. Each method maps to one
 * `ipcMain.handle` in the main process; nothing else from Electron or Node is exposed.
 */
const office: OfficeBridge = {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  invoicePdf: (req) => ipcRenderer.invoke("invoice:pdf", req),
  invoicePdfReady: () => ipcRenderer.invoke("invoice:pdfReady"),
  saveCsv: (req) => ipcRenderer.invoke("report:saveCsv", req),
};

contextBridge.exposeInMainWorld("office", office);
