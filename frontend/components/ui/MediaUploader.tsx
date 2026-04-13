// File: frontend/components/ui/MediaUploader.tsx
"use client";

import { useRef, useState } from "react";

import {
  deleteVisitMedia,
  uploadVisitMedia,
} from "@/lib/services/logVisitService";
import type { MediaItem } from "@/types/visit";

type UploadSlot = {
  id: string;
  name: string;
  state: "uploading" | "error";
};

type MediaUploaderProps = {
  items: MediaItem[];
  uploaderId: string;
  onChange: (items: MediaItem[]) => void;
};

export function MediaUploader({
  items,
  uploaderId,
  onChange,
}: MediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<UploadSlot[]>([]);

  const openPicker = () => fileInputRef.current?.click();

  const handleFiles = async (files: FileList) => {
    const accepted = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!accepted.length) return;

    const pending: UploadSlot[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      state: "uploading",
    }));
    setSlots((prev) => [...prev, ...pending]);

    const results = await Promise.allSettled(
      accepted.map((file) => uploadVisitMedia(file, uploaderId)),
    );

    const uploaded: MediaItem[] = [];
    const failed: UploadSlot[] = [];

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        uploaded.push(result.value);
      } else {
        failed.push({ ...pending[i], state: "error" });
      }
    });

    setSlots((prev) =>
      prev.filter((s) => !pending.some((p) => p.id === s.id)).concat(failed),
    );

    if (uploaded.length) onChange([...items, ...uploaded]);
  };

  const handleRemove = async (index: number) => {
    try {
      await deleteVisitMedia(items[index].storagePath);
    } catch {
      // Remove from UI even if Storage delete fails
    }
    onChange(items.filter((_, i) => i !== index));
  };

  const dismissSlot = (id: string) =>
    setSlots((prev) => prev.filter((s) => s.id !== id));

  const total =
    items.length + slots.filter((s) => s.state === "uploading").length;

  return (
    <div className="space-y-3">
      {/* Empty drop zone */}
      {!items.length && !slots.length ? (
        <button
          type="button"
          onClick={openPicker}
          className="group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-page py-10 text-center transition hover:border-accent/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-sm transition group-hover:bg-accent/5 group-hover:shadow">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-textSecondary transition group-hover:text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-textPrimary">
              Add photos or videos
            </p>
            <p className="mt-0.5 text-xs text-textSecondary">
              Tap to open camera or choose from gallery
            </p>
          </div>
        </button>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-textSecondary">
              {total > 0 ? `${total} file${total > 1 ? "s" : ""}` : ""}
            </p>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-textPrimary shadow-sm transition hover:bg-page focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add more
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((item, index) => (
              <div
                key={item.storagePath}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-page"
              >
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={`Visit media ${index + 1}`}
                    className="h-full w-full object-cover transition group-hover:opacity-80"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-page">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 text-textSecondary"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    <span className="text-[10px] text-textSecondary">
                      Video
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute inset-0 flex items-center justify-center bg-textPrimary/0 text-danger/40 transition hover:bg-danger/20 hover:text-danger focus-visible:bg-danger/20 focus-visible:text-danger"
                  aria-label="Remove media"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Upload/error slots */}
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="aspect-square overflow-hidden rounded-xl border border-border bg-page"
              >
                {slot.state === "uploading" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
                    <p className="line-clamp-2 text-center text-[10px] text-textSecondary">
                      {slot.name}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => dismissSlot(slot.id)}
                    className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center"
                    aria-label="Dismiss failed upload"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-danger"
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
                    <p className="text-[10px] text-danger">
                      Failed — tap to dismiss
                    </p>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
