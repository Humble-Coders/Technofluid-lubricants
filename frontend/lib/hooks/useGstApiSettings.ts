"use client";

import { useEffect, useState } from "react";
import {
  type GstApiSettings,
  DEFAULT_GST_SETTINGS,
  subscribeGstApiSettings,
} from "@/lib/services/adminSettingsService";

export function useGstApiSettings() {
  const [settings, setSettings] = useState<GstApiSettings>(DEFAULT_GST_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeGstApiSettings((s) => {
      setSettings(s);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { settings, loading };
}
