import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GST_REGEX, fetchGstFromApi } from "./appyflowClient.js";
import { fetchGstFromCustomApi } from "./customProviderClient.js";
import type { GstVerifyRequest, GstVerifiedData, GstCacheDoc } from "./types.js";

// ─── Secret ──────────────────────────────────────────────────────────────────
// Set with: firebase functions:secrets:set APPYFLOW_API_KEY

const APPYFLOW_API_KEY = defineSecret("APPYFLOW_API_KEY");

// ─── Settings ─────────────────────────────────────────────────────────────────

type GstApiSettings = {
  enabled: boolean;
  provider: "appyflow" | "custom";
  appyflowKey?: string;
  customProvider?: {
    endpoint?: string;
    apiKey?: string;
  };
};

async function getGstApiSettings(): Promise<GstApiSettings> {
  const snap = await admin
    .firestore()
    .collection("admin_settings")
    .doc("gst")
    .get();

  if (!snap.exists) {
    return { enabled: true, provider: "appyflow" };
  }

  const data = snap.data() as Partial<GstApiSettings>;
  return {
    enabled: data.enabled !== false,
    provider: data.provider ?? "appyflow",
    customProvider: data.customProvider ?? {},
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_COLLECTION = "gst_cache";

async function getFromCache(
  gstNumber: string
): Promise<GstVerifiedData | null> {
  const snap = await admin
    .firestore()
    .collection(CACHE_COLLECTION)
    .doc(gstNumber)
    .get();

  if (!snap.exists) return null;

  const { cachedAt, ...data } = snap.data() as GstCacheDoc;
  return data as GstVerifiedData;
}

async function writeToCache(
  gstNumber: string,
  data: GstVerifiedData
): Promise<void> {
  await admin
    .firestore()
    .collection(CACHE_COLLECTION)
    .doc(gstNumber)
    .set({
      ...data,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ─── Callable ─────────────────────────────────────────────────────────────────

export const verifyGST = onCall(
  { region: "us-central1", secrets: [APPYFLOW_API_KEY] },
  async (request): Promise<GstVerifiedData> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const { gstNumber } = request.data as GstVerifyRequest;

    if (!gstNumber?.trim()) {
      throw new HttpsError("invalid-argument", "GST number is required.");
    }

    const normalized = gstNumber.trim().toUpperCase();

    if (!GST_REGEX.test(normalized)) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid GST number format. Expected format: 22AAAAA0000A1Z5"
      );
    }

    // 1. Check admin settings
    const settings = await getGstApiSettings();

    if (!settings.enabled) {
      throw new HttpsError(
        "failed-precondition",
        "GST verification is currently disabled. Please enter firm details manually."
      );
    }

    // 2. Cache hit
    const cached = await getFromCache(normalized);
    if (cached) return cached;

    // 3. Fetch from configured provider
    let data: GstVerifiedData;

    if (settings.provider === "custom") {
      data = await fetchGstFromCustomApi(
        normalized,
        settings.customProvider?.endpoint ?? "",
        settings.customProvider?.apiKey ?? ""
      );
    } else {
      // Use the key saved in Firestore settings; fall back to the Firebase Secret
      const apiKey = settings.appyflowKey?.trim() || APPYFLOW_API_KEY.value();
      data = await fetchGstFromApi(normalized, apiKey);
    }

    // 4. Persist to cache (fire-and-forget)
    writeToCache(normalized, data).catch((err) =>
      console.error("gst_cache write failed:", err)
    );

    return data;
  }
);
