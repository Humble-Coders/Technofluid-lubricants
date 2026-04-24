import * as https from "https";
import { HttpsError } from "firebase-functions/v2/https";
import type {
  AppyFlowResponse,
  AppyFlowAddr,
  GstVerifiedData,
} from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const APPYFLOW_HOST = "appyflow.in";
const APPYFLOW_PATH = "/api/verifyGST";

export const GST_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function httpGet(
  host: string,
  path: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: host, path }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode ?? 0, body })
      );
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

// ─── Response normalizer ─────────────────────────────────────────────────────

function buildAddress(addr: AppyFlowAddr | undefined): string {
  if (!addr) return "";
  return [addr.bno, addr.bnm, addr.flno, addr.st, addr.loc, addr.dst, addr.city]
    .filter(Boolean)
    .join(", ");
}

function normalizeResponse(raw: AppyFlowResponse): GstVerifiedData {
  const t = raw.taxpayerInfo;
  if (!t) {
    throw new HttpsError("not-found", "GST details not found in API response.");
  }

  const addr = t.pradr?.addr;

  return {
    gstin: t.gstin ?? "",
    legalName: t.lgnm ?? "",
    tradeName: t.tradeNam ?? t.lgnm ?? "",
    status: t.sts ?? "Unknown",
    registrationDate: t.rgdt ?? "",
    constitution: t.ctb ?? "",
    address: buildAddress(addr),
    state: addr?.stcd ?? "",
    pincode: addr?.pncd ?? "",
  };
}

// ─── API caller with 1 retry on server errors ─────────────────────────────────

export async function fetchGstFromApi(
  gstNumber: string,
  apiKey: string,
  attempt = 1
): Promise<GstVerifiedData> {
  const path = `${APPYFLOW_PATH}?key_secret=${encodeURIComponent(apiKey)}&gstNo=${encodeURIComponent(gstNumber)}`;

  let statusCode: number;
  let body: string;

  try {
    ({ statusCode, body } = await httpGet(APPYFLOW_HOST, path));
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1_000));
      return fetchGstFromApi(gstNumber, apiKey, attempt + 1);
    }
    throw new HttpsError(
      "unavailable",
      "Could not reach the GST verification service."
    );
  }

  if (statusCode === 429) {
    throw new HttpsError(
      "resource-exhausted",
      "GST API rate limit reached. Please try again shortly."
    );
  }

  if (statusCode >= 500) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1_000));
      return fetchGstFromApi(gstNumber, apiKey, attempt + 1);
    }
    throw new HttpsError("unavailable", `GST API returned ${statusCode}.`);
  }

  if (statusCode >= 400) {
    throw new HttpsError("not-found", "GST number not found or invalid.");
  }

  let json: AppyFlowResponse;
  try {
    json = JSON.parse(body) as AppyFlowResponse;
  } catch {
    throw new HttpsError("internal", "Unexpected response from GST API.");
  }

  if (json.error === true) {
    throw new HttpsError(
      "not-found",
      json.message ?? "GST number not found or inactive."
    );
  }

  return normalizeResponse(json);
}
