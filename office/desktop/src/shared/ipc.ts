/** Types shared by the main process, the preload bridge and the screens. */

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
}

/** One invoice PDF from the Humble Bill Engine (main/hbe/invoices.ts). */
export interface InvoicePdfRequest {
  /** HBE bill data from office/core saleToHbeBill — every value already formatted. */
  bill: object;
  /** The e-invoice QR (PNG bytes), once e-invoicing is connected. */
  irnQrPng?: Uint8Array;
  /** Without ".pdf", e.g. "TF/2026-27/0869 Original Copy" (made safe for the file system). */
  fileName: string;
  /** "save": ask where to save it. "open": open it in the computer's PDF app (to view or print). "preview": just return the PDF, to show on screen. */
  action: "save" | "open" | "preview";
}

export type InvoicePdfResult =
  | { ok: true; cancelled: true }
  /** path: "" for a preview, which returns the PDF bytes instead of writing a file. */
  | { ok: true; cancelled: false; path: string; pages: number; sha256: string; templateSource: "synced" | "bundled" | "inline"; hbeVersion: string; pdf?: Uint8Array }
  /** type: HBE's refusal type (MissingRequiredField, UnrenderableText, HelperMissing …); field: the empty field. */
  | { ok: false; type: string; message: string; field?: string };

/** A report saved as a CSV file (main/csv.ts). */
export interface SaveCsvRequest {
  /** Without ".csv", e.g. "Sales by product 2026-11-01 to 2026-11-15" (made safe for the file system). */
  fileName: string;
  text: string;
}

export type SaveCsvResult = { ok: true; cancelled: true } | { ok: true; cancelled: false; path: string } | { ok: false; message: string };

/** In-app updates (main/updater.ts): what the main process tells the screens, and what they can ask. */
export const UPDATE_EVENT_CHANNEL = "technofluid:update-event";
export const UPDATE_ACTION_CHANNEL = "technofluid:update-action";

export type UpdateEvent =
  | { kind: "available"; version: string; notes: string | null }
  | { kind: "progress"; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

export type UpdateAction = "download" | "install" | "openPage";

/** Everything the screens can ask the computer for. Keep this list short on purpose. */
export interface OfficeBridge {
  platform: string;
  getAppInfo(): Promise<AppInfo>;
  invoicePdf(req: InvoicePdfRequest): Promise<InvoicePdfResult>;
  /** Whether this copy of the app can make invoice PDFs (the PDF maker is installed); reason when not. */
  invoicePdfReady(): Promise<{ ready: boolean; reason: string | null }>;
  /** Asks where to save a report's CSV and writes it there. */
  saveCsv(req: SaveCsvRequest): Promise<SaveCsvResult>;
  /** Update news from the main process; returns a function that stops listening. */
  onUpdate(listener: (event: UpdateEvent) => void): () => void;
  /** Download the offered update, install it now (restart), or open the download page. */
  update(action: UpdateAction): Promise<void>;
}
