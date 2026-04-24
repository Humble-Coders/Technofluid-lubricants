"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";
import {
  type GstApiSettings,
  type GstApiProvider,
  getGstApiSettings,
  saveGstApiSettings,
} from "@/lib/services/adminSettingsService";

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GstApiSettings>({
    enabled: true,
    provider: "appyflow",
    appyflowKey: "",
    customProvider: { name: "", endpoint: "", apiKey: "" },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAppyflowKey, setShowAppyflowKey] = useState(false);

  useEffect(() => {
    getGstApiSettings()
      .then(setSettings)
      .catch(() => setError("Could not load settings. Please refresh the page."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveGstApiSettings(settings, user.uid);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateCustomProvider = (
    field: keyof GstApiSettings["customProvider"],
    value: string,
  ) => {
    setSettings((prev) => ({
      ...prev,
      customProvider: { ...prev.customProvider, [field]: value },
    }));
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return (
    <section className="space-y-5">

      {/* ── GST Auto-fill toggle ── */}
      <Card>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <p className="text-base font-semibold text-textPrimary">
              GST Auto-fill
            </p>
            <p className="text-sm text-textSecondary leading-relaxed">
              When turned on, salespersons can type a GST number and the firm
              name fills in automatically. When turned off, they type everything
              by hand.
            </p>
            <span
              className={`inline-block mt-1 rounded-full px-3 py-0.5 text-xs font-semibold ${
                settings.enabled
                  ? "bg-success/10 text-success"
                  : "bg-border text-textSecondary"
              }`}
            >
              {settings.enabled ? "Currently ON" : "Currently OFF"}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
            className="relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
            style={{
              backgroundColor: settings.enabled
                ? "var(--color-accent)"
                : "var(--color-border)",
            }}
            role="switch"
            aria-checked={settings.enabled}
          >
            <span
              className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{
                transform: settings.enabled
                  ? "translateX(25px)"
                  : "translateX(3px)",
              }}
            />
          </button>
        </div>
      </Card>

      {/* ── Provider + keys (only when enabled) ── */}
      {settings.enabled && (
        <>
          {/* Provider selection */}
          <Card>
            <p className="text-base font-semibold text-textPrimary">
              Which service does the GST lookup?
            </p>
            <p className="mt-0.5 text-sm text-textSecondary">
              Choose the service that provides firm details when a GST number is
              entered.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    value: "appyflow" as GstApiProvider,
                    title: "AppyFlow",
                    description: "The default service. Already set up.",
                  },
                  {
                    value: "custom" as GstApiProvider,
                    title: "Another service",
                    description:
                      "Use a different GST lookup service of your choice.",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, provider: option.value }))
                  }
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    settings.provider === option.value
                      ? "border-accent bg-accent/5"
                      : "border-border bg-page hover:border-accent/30"
                  }`}
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition"
                    style={{
                      borderColor:
                        settings.provider === option.value
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                    }}
                  >
                    {settings.provider === option.value && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: "var(--color-accent)" }}
                      />
                    )}
                  </span>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        settings.provider === option.value
                          ? "text-accent"
                          : "text-textPrimary"
                      }`}
                    >
                      {option.title}
                    </p>
                    <p className="mt-0.5 text-xs text-textSecondary">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* AppyFlow key */}
          {settings.provider === "appyflow" && (
            <Card>
              <p className="text-base font-semibold text-textPrimary">
                AppyFlow Secret Key
              </p>
              <p className="mt-0.5 text-sm text-textSecondary leading-relaxed">
                This is the password that connects the app to AppyFlow. You get
                this from your AppyFlow account. Leave it blank to keep using
                the existing key.
              </p>

              <div className="mt-4 flex gap-2">
                <div className="flex-1">
                  <Input
                    id="appyflow-key"
                    label="Secret Key"
                    type={showAppyflowKey ? "text" : "password"}
                    placeholder={
                      settings.appyflowKey
                        ? "Key is set — type to replace it"
                        : "Enter the key from your AppyFlow account"
                    }
                    value={settings.appyflowKey}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        appyflowKey: e.target.value,
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowAppyflowKey((v) => !v)}
                  className="mt-7 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-page text-textSecondary transition hover:text-textPrimary"
                  title={showAppyflowKey ? "Hide key" : "Show key"}
                >
                  {showAppyflowKey ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </Card>
          )}

          {/* Custom provider fields */}
          {settings.provider === "custom" && (
            <Card>
              <p className="text-base font-semibold text-textPrimary">
                Custom Service Details
              </p>
              <p className="mt-0.5 text-sm text-textSecondary leading-relaxed">
                Enter the details from the GST service you signed up with. These
                are usually in the welcome email or the service's dashboard.
              </p>

              <div className="mt-4 space-y-3">
                <Input
                  id="custom-provider-name"
                  label="Service Name"
                  placeholder="e.g. Masters India"
                  value={settings.customProvider.name}
                  onChange={(e) => updateCustomProvider("name", e.target.value)}
                />
                <Input
                  id="custom-provider-endpoint"
                  label="Service Link"
                  placeholder="https://..."
                  value={settings.customProvider.endpoint}
                  onChange={(e) =>
                    updateCustomProvider("endpoint", e.target.value)
                  }
                />
                <Input
                  id="custom-provider-key"
                  label="Secret Key"
                  placeholder="Provided by the service"
                  value={settings.customProvider.apiKey}
                  onChange={(e) =>
                    updateCustomProvider("apiKey", e.target.value)
                  }
                />
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Feedback ── */}
      {error && (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <div className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-success"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <p className="text-sm text-success">Changes saved.</p>
        </div>
      )}

      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} isLoading={saving}>
          Save Changes
        </Button>
      </div>
    </section>
  );
}
