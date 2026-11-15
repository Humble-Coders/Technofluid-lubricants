import { app, dialog, ipcMain, type BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SaveCsvRequest, SaveCsvResult } from "../shared/ipc";

/** At most 20 MB of text — a report is far smaller; anything bigger is a mistake. */
const MAX_CHARS = 20_000_000;

const safeFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "report"}.csv`;

/**
 * "Save as CSV" for the reports: asks where to save (Documents by default) and writes the
 * text as UTF-8 with a byte-order mark, so Excel shows ₹ and Indian names correctly. Only
 * a .csv file the person picked is ever written.
 */
async function saveCsv(win: BrowserWindow | null, req: SaveCsvRequest): Promise<SaveCsvResult> {
  try {
    if (typeof req?.text !== "string" || typeof req?.fileName !== "string") return { ok: false, message: "Nothing to save." };
    if (req.text.length > MAX_CHARS) return { ok: false, message: "That report is too big to save." };
    const options = { title: "Save report as CSV", defaultPath: join(app.getPath("documents"), safeFileName(req.fileName)), filters: [{ name: "CSV (Excel)", extensions: ["csv"] }] };
    const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return { ok: true, cancelled: true };
    const path = choice.filePath.toLowerCase().endsWith(".csv") ? choice.filePath : `${choice.filePath}.csv`;
    writeFileSync(path, `﻿${req.text}`, "utf8");
    return { ok: true, cancelled: false, path };
  } catch (e) {
    return { ok: false, message: `The file couldn't be saved: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Wires `report:saveCsv`. Call once when the app is ready. */
export function registerCsv(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("report:saveCsv", (_event, req: SaveCsvRequest) => saveCsv(getWindow(), req));
}
