import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type GstApiProvider = "appyflow" | "custom";

export type GstApiSettings = {
  enabled: boolean;
  provider: GstApiProvider;
  appyflowKey: string;
  customProvider: {
    name: string;
    endpoint: string;
    apiKey: string;
  };
  updatedAt?: unknown;
  updatedBy?: string;
};

const SETTINGS_DOC = doc(db, "admin_settings", "gst");

export const DEFAULT_GST_SETTINGS: GstApiSettings = {
  enabled: true,
  provider: "appyflow",
  appyflowKey: "",
  customProvider: { name: "", endpoint: "", apiKey: "" },
};

export async function getGstApiSettings(): Promise<GstApiSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return DEFAULT_GST_SETTINGS;
  return { ...DEFAULT_GST_SETTINGS, ...(snap.data() as Partial<GstApiSettings>) };
}

export function subscribeGstApiSettings(
  callback: (settings: GstApiSettings) => void,
): () => void {
  return onSnapshot(SETTINGS_DOC, (snap) => {
    if (!snap.exists()) {
      callback(DEFAULT_GST_SETTINGS);
    } else {
      callback({
        ...DEFAULT_GST_SETTINGS,
        ...(snap.data() as Partial<GstApiSettings>),
      });
    }
  });
}

export async function saveGstApiSettings(
  settings: GstApiSettings,
  userId: string,
): Promise<void> {
  await setDoc(SETTINGS_DOC, {
    enabled: settings.enabled,
    provider: settings.provider,
    appyflowKey: settings.appyflowKey,
    customProvider: settings.customProvider,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}
