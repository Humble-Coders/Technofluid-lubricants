import * as https from "https";
import * as http from "http";
import { URL } from "url";
import { HttpsError } from "firebase-functions/v2/https";
import type { GstVerifiedData } from "./types.js";

export async function fetchGstFromCustomApi(
  gstNumber: string,
  endpoint: string,
  apiKey: string
): Promise<GstVerifiedData> {
  if (!endpoint?.trim()) {
    throw new HttpsError("internal", "Custom GST API endpoint is not configured.");
  }
  if (!apiKey?.trim()) {
    throw new HttpsError("internal", "Custom GST API key is not configured.");
  }

  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new HttpsError("internal", "Custom GST API endpoint URL is invalid.");
  }
  url.searchParams.set("gstNo", gstNumber);
  url.searchParams.set("apiKey", apiKey);

  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  let statusCode: number;
  let body: string;

  try {
    ({ statusCode, body } = await new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const req = transport.get(
          url.toString(),
          { headers: { Accept: "application/json" } },
          (res) => {
            let buf = "";
            res.on("data", (chunk: Buffer) => (buf += chunk.toString()));
            res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: buf }));
          }
        );
        req.on("error", reject);
        req.setTimeout(10_000, () => {
          req.destroy();
          reject(new Error("Custom GST API request timed out"));
        });
      }
    ));
  } catch {
    throw new HttpsError("unavailable", "Could not reach the custom GST verification service.");
  }

  if (statusCode === 429) {
    throw new HttpsError("resource-exhausted", "Custom GST API rate limit reached.");
  }
  if (statusCode >= 400) {
    throw new HttpsError("not-found", "GST number not found or invalid (custom API).");
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new HttpsError("internal", "Unexpected response format from custom GST API.");
  }

  const str = (...keys: string[]): string => {
    for (const key of keys) {
      const val = json[key];
      if (typeof val === "string" && val) return val;
    }
    return "";
  };

  const legalName = str("legalName", "legal_name", "businessName", "business_name", "lgnm");
  if (!legalName) {
    throw new HttpsError(
      "not-found",
      "Could not extract firm details from custom API response. Ensure the response includes a `legalName` field."
    );
  }

  return {
    gstin: gstNumber,
    legalName,
    tradeName: str("tradeName", "trade_name", "tradeNam") || legalName,
    status: str("status", "gstStatus", "sts") || "Unknown",
    registrationDate: str("registrationDate", "registration_date", "rgdt"),
    constitution: str("constitution", "ctb"),
    address: str("address", "registeredAddress", "registered_address"),
    state: str("state", "stcd"),
    pincode: str("pincode", "pin", "pncd"),
  };
}
