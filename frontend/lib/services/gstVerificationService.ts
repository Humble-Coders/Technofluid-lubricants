import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { GstVerifiedData } from "@/types/gst";

// GST format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
export const GST_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstFormat(gstNumber: string): boolean {
  return GST_REGEX.test(gstNumber.trim().toUpperCase());
}

const verifyGSTCallable = httpsCallable<{ gstNumber: string }, GstVerifiedData>(
  functions,
  "verifyGST"
);

function parseFirebaseError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    const msg =
      "message" in err ? (err as { message: string }).message : "";

    switch (code) {
      case "functions/unauthenticated":
        return "You must be logged in to verify a GST number.";
      case "functions/invalid-argument":
        return msg || "Invalid GST number format.";
      case "functions/not-found":
        return "GST number not found. Please check and try again.";
      case "functions/resource-exhausted":
        return "Too many requests. Please wait a moment and try again.";
      case "functions/unavailable":
        return "GST verification service is temporarily unavailable.";
      default:
        return msg || "Verification failed. Please try again.";
    }
  }
  return "An unexpected error occurred.";
}

export async function verifyGstNumber(
  gstNumber: string
): Promise<GstVerifiedData> {
  const normalized = gstNumber.trim().toUpperCase();

  if (!isValidGstFormat(normalized)) {
    throw new Error("Invalid GST number format. Expected: 22AAAAA0000A1Z5");
  }

  const result: HttpsCallableResult<GstVerifiedData> =
    await verifyGSTCallable({ gstNumber: normalized }).catch((err) => {
      throw new Error(parseFirebaseError(err));
    });

  return result.data;
}
