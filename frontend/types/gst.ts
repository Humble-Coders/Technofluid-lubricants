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

export type GstVerifyStatus = "idle" | "loading" | "success" | "error";

export interface GstVerifyState {
  status: GstVerifyStatus;
  data: GstVerifiedData | null;
  error: string | null;
}
