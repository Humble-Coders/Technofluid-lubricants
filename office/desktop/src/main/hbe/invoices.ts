/**
 * Invoice PDFs with the Humble Bill Engine (HBE), in the main process.
 *
 * The screens build the bill data (office/core/src/invoice-bill.ts — every value already
 * formatted) and ask for one PDF: saved where the person chooses, or opened in the
 * computer's PDF app to view and print. This file only runs the PDF maker and handles files.
 *
 * Where things are (HBE guide, "Electron"):
 *  - the PDF maker: office/hbe/vendor/hbe-render-<v>-<platform> in development; in the
 *    installed app, resources/hbe-render/<platform> (electron-builder extraResources).
 *  - the template shipped with the app: office/hbe/templates (resources/hbe-templates),
 *    so the first invoice prints offline. A newer published copy is synced in the background
 *    into the app's data folder and used from then on.
 */
import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InvoicePdfRequest, InvoicePdfResult } from "../../shared/ipc";
import { HbeError, HbeRender } from "./hbeRender";

export const HBE_VERSION = "0.3.0";
const TEMPLATE = { template: "technofluid-tax-invoice", contract: 1 } as const;

/** "macos-arm64" / "macos-x64" / "windows-x64" — the helper package names. */
function platformDir(): string {
  const os = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
  return `${os}-${process.arch === "arm64" ? "arm64" : "x64"}`;
}

function paths() {
  if (app.isPackaged) {
    const r = process.resourcesPath;
    return { helperDir: join(r, "hbe-render", platformDir()), bundledDir: join(r, "hbe-templates"), probe: join(r, "hbe-probe.json") };
  }
  const hbe = join(app.getAppPath(), "..", "hbe");
  return {
    helperDir: join(hbe, "vendor", `hbe-render-${HBE_VERSION}-${platformDir()}`),
    bundledDir: join(hbe, "templates"),
    probe: join(hbe, "samples", "typical.json"),
  };
}

/** The PDF maker's files are there (packaged builds ship without it until packaging is done). */
function helperInstalled(): boolean {
  const dir = paths().helperDir;
  const java = join(dir, "runtime", "bin", process.platform === "win32" ? "java.exe" : "java");
  return existsSync(java) && existsSync(join(dir, "lib", "hbe-render.jar"));
}

let starting: Promise<HbeRender> | null = null;
let synced = false;

/** The PDF maker, started on first use and kept running (a dead one restarts by itself). */
function hbe(): Promise<HbeRender> {
  if (!starting) {
    const p = paths();
    starting = HbeRender.start({
      helperDir: p.helperDir,
      bundledDir: p.bundledDir,
      storeDir: join(app.getPath("userData"), "hbe-templates"),
      log: (line) => console.log(`[hbe] ${line}`),
    }).catch((e: unknown) => {
      starting = null; // try again next time
      throw e;
    });
  }
  return starting;
}

/** Background: fetch a newer published template if there is one. Never blocks printing. Once per run. */
async function syncTemplate(): Promise<void> {
  if (synced) return;
  synced = true;
  try {
    const probe = JSON.parse(readFileSync(paths().probe, "utf8")) as object;
    const r = await (await hbe()).sync({ ...TEMPLATE, probe });
    if (r.result === "rejected") console.warn(`[hbe] template sync rejected: ${r.reason ?? ""}`);
    else console.log(`[hbe] template sync: ${r.result}${r.reason ? ` (${r.reason})` : ""}`);
  } catch (e) {
    console.warn(`[hbe] template sync skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** "TF/2026-27/0869 Original Copy" → "TF-2026-27-0869 Original Copy.pdf" (nothing a file system dislikes). */
const safeFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "invoice"}.pdf`;

const TEMP_DIR = () => join(app.getPath("temp"), "technofluid-invoices");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let tempCleaned = false;

/** PDFs opened for printing are left in a temp folder; drop the ones older than a week (once per run). */
function cleanOldTempPdfs(): void {
  if (tempCleaned) return;
  tempCleaned = true;
  try {
    const dir = TEMP_DIR();
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (name.endsWith(".pdf") && Date.now() - statSync(file).mtimeMs > WEEK_MS) unlinkSync(file);
    }
  } catch (e) {
    console.warn(`[hbe] couldn't tidy old invoice PDFs: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function makePdf(win: BrowserWindow | null, req: InvoicePdfRequest): Promise<InvoicePdfResult> {
  cleanOldTempPdfs();
  try {
    const images = req.irnQrPng ? { irnQr: req.irnQrPng } : undefined;
    const r = await (await hbe()).render({ ...TEMPLATE, bill: req.bill, images, returnTemplate: false });
    if (!r.pdf) throw new HbeError("Internal", "The PDF maker returned no PDF");
    const fileName = safeFileName(req.fileName);

    let path: string;
    if (req.action === "save") {
      const options = { title: "Save invoice PDF", defaultPath: join(app.getPath("documents"), fileName), filters: [{ name: "PDF", extensions: ["pdf"] }] };
      const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (choice.canceled || !choice.filePath) return { ok: true, cancelled: true };
      path = choice.filePath;
      writeFileSync(path, r.pdf);
    } else {
      const dir = TEMP_DIR();
      mkdirSync(dir, { recursive: true });
      path = join(dir, fileName);
      writeFileSync(path, r.pdf);
      const failed = await shell.openPath(path);
      if (failed) return { ok: false, type: "OpenFailed", message: `The PDF was made but couldn't be opened: ${failed}` };
    }
    return { ok: true, cancelled: false, path, pages: r.pages, sha256: r.sha256, templateSource: r.template.source, hbeVersion: HBE_VERSION };
  } catch (e) {
    if (e instanceof HbeError) return { ok: false, type: e.type, message: e.message.split("\n")[0]!, field: e.field };
    return { ok: false, type: "Internal", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Wires `invoice:pdf` and `invoice:pdfReady`. Call once when the app is ready. The PDF maker
 * (a Java process) isn't started here: it starts when an invoice is first opened (the ready
 * check, which also syncs the template in the background) or printed, so roles that never
 * print never run it.
 */
export function registerInvoicePdf(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("invoice:pdf", (_event, req: InvoicePdfRequest) => makePdf(getWindow(), req));
  ipcMain.handle("invoice:pdfReady", () => {
    if (!helperInstalled()) return { ready: false, reason: "The PDF maker isn't installed with this copy of the app yet." };
    void syncTemplate();
    return { ready: true, reason: null };
  });
}

/** Stops the PDF maker when the app quits. */
export async function stopInvoicePdf(): Promise<void> {
  if (!starting) return;
  try {
    await (await starting).close();
  } catch {
    // It never started — nothing to stop.
  }
}
