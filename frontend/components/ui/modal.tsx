// File: frontend/components/ui/modal.tsx
"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  mode?: "dialog" | "workspace";
};

export function Modal({
  isOpen,
  title,
  onClose,
  children,
  footer,
  mode = "dialog",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  if (mode === "workspace") {
    return (
      <div
        className="fixed top-18.25 right-0 bottom-0 left-0 z-30 bg-page lg:left-(--admin-sidebar-width,16rem)"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex h-full w-full flex-col px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 border-b border-border pb-4">
            <button
              type="button"
              onClick={onClose}
              className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-textPrimary transition hover:bg-page focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
              aria-label="Go back"
              title="Go back"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h2 className="text-2xl font-semibold tracking-tight text-textPrimary">
              {title}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <div className="mt-6 flex justify-end gap-3">{footer}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-textPrimary/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-md"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-textPrimary">{title}</h2>
        <div className="mt-4">{children}</div>
        {footer ? (
          <div className="mt-6 flex justify-end gap-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
