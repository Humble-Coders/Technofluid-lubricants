export interface GstVerifyRequest {
  gstNumber: string;
}

export interface GstVerifiedData {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: string;
  registrationDate: string;
  constitution: string;
  address: string;
  state: string;
  pincode: string;
}

export interface GstCacheDoc extends GstVerifiedData {
  cachedAt: FirebaseFirestore.Timestamp;
}

// ─── AppyFlow actual response shape ──────────────────────────────────────────
// Docs: GET https://appyflow.in/api/verifyGST?key_secret=KEY&gstNo=GSTIN

export interface AppyFlowAddr {
  bno?: string;   // building number
  bnm?: string;   // building name
  flno?: string;  // floor number
  st?: string;    // street
  loc?: string;   // locality
  dst?: string;   // district
  city?: string;
  stcd?: string;  // state
  pncd?: string;  // pincode
  lg?: string;
  lt?: string;
}

export interface AppyFlowPradr {
  addr?: AppyFlowAddr;
  ntr?: string;
}

export interface AppyFlowTaxpayerInfo {
  gstin?: string;
  lgnm?: string;      // legal name
  tradeNam?: string;  // trade name
  sts?: string;       // status: "Active" | "Inactive" etc.
  rgdt?: string;      // registration date dd/mm/yyyy
  ctb?: string;       // constitution e.g. "Proprietorship"
  pradr?: AppyFlowPradr;
  dty?: string;       // taxpayer type e.g. "Regular"
}

export interface AppyFlowResponse {
  error?: boolean;
  message?: string;
  taxpayerInfo?: AppyFlowTaxpayerInfo;
  filing?: unknown[];
  compliance?: unknown;
}
