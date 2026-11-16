import { contextBridge, ipcRenderer } from "electron";
import { UPDATE_ACTION_CHANNEL, UPDATE_EVENT_CHANNEL, type OfficeBridge, type UpdateEvent } from "../shared/ipc";

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
  onUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, update: UpdateEvent) => listener(update);
    ipcRenderer.on(UPDATE_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(UPDATE_EVENT_CHANNEL, handler);
  },
  update: (action) => ipcRenderer.invoke(UPDATE_ACTION_CHANNEL, action),
};

contextBridge.exposeInMainWorld("office", office);
