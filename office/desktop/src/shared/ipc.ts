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
  /** "save": ask where to save it. "open": open it in the computer's PDF app (to view or print). */
  action: "save" | "open";
}

export type InvoicePdfResult =
  | { ok: true; cancelled: true }
  | { ok: true; cancelled: false; path: string; pages: number; sha256: string; templateSource: "synced" | "bundled" | "inline"; hbeVersion: string }
  /** type: HBE's refusal type (MissingRequiredField, UnrenderableText, HelperMissing …); field: the empty field. */
  | { ok: false; type: string; message: string; field?: string };

/** Everything the screens can ask the computer for. Keep this list short on purpose. */
export interface OfficeBridge {
  platform: string;
  getAppInfo(): Promise<AppInfo>;
  invoicePdf(req: InvoicePdfRequest): Promise<InvoicePdfResult>;
  /** Whether this copy of the app can make invoice PDFs (the PDF maker is installed); reason when not. */
  invoicePdfReady(): Promise<{ ready: boolean; reason: string | null }>;
}
