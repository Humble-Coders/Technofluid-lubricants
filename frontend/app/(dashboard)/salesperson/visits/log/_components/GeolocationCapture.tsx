// File: frontend/app/(dashboard)/salesperson/visits/log/_components/GeolocationCapture.tsx
"use client";

import { useState } from "react";

type Location = { lat: number; lng: number };

type GeolocationCaptureProps = {
  location: Location | null;
  onCapture: (location: Location) => void;
  onError: (message: string) => void;
  error?: string;
};

export function GeolocationCapture({
  location,
  onCapture,
  onError,
  error,
}: GeolocationCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);

  const capture = () => {
    if (!navigator.geolocation) {
      onError("Geolocation is not supported by your browser.");
      return;
    }
    setIsCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsCapturing(false);
        onCapture({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setIsCapturing(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            onError(
              "Location access denied. Enable it in your browser settings.",
            );
            break;
          case err.POSITION_UNAVAILABLE:
            onError("Location unavailable. Check your signal and try again.");
            break;
          case err.TIMEOUT:
            onError("Location request timed out. Please try again.");
            break;
          default:
            onError("Could not capture location. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-textPrimary">Location</p>

      {location ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-success"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-success">
                Location captured
              </p>
              <p className="font-mono text-[11px] text-textSecondary">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={capture}
            disabled={isCapturing}
            className="shrink-0 text-xs font-medium text-textSecondary underline-offset-2 transition hover:text-textPrimary hover:underline disabled:opacity-50"
          >
            {isCapturing ? "Detecting…" : "Recapture"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={capture}
          disabled={isCapturing}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-page px-4 py-3 transition hover:border-accent/50 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm">
            {isCapturing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-textSecondary"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-textPrimary">
              {isCapturing ? "Getting location…" : "Capture current location"}
            </p>
            <p className="text-xs text-textSecondary">
              Uses your device GPS
            </p>
          </div>
        </button>
      )}

      {error && (
        <div className="flex items-start gap-1.5">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
