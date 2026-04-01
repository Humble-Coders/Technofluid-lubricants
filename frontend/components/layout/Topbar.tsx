// File: frontend/components/layout/Topbar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

type TopbarProps = {
  title: string;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export function Topbar({
  title,
  isSidebarCollapsed,
  onToggleSidebar,
}: TopbarProps) {
  const router = useRouter();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Failed to log out", error);
    } finally {
      setOpen(false);
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-page/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden items-center justify-center rounded-xl border border-border bg-surface p-2.5 text-textSecondary transition hover:bg-page hover:text-textPrimary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 lg:inline-flex"
            aria-label={
              isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>

          <h1 className="text-xl font-semibold tracking-tight text-textPrimary">
            {title}
          </h1>
        </div>

        <div className="relative" ref={profileMenuRef}>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-textSecondary transition hover:bg-page hover:text-textPrimary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
            aria-label="Open profile menu"
            title="Admin profile"
            aria-expanded={open}
            aria-haspopup="menu"
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
              <path d="M20 21a8 8 0 0 0-16 0" />
              <circle cx="12" cy="8" r="4" />
            </svg>
          </button>

          {open ? (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-surface p-2 shadow-md"
              role="menu"
            >
              <div className="rounded-lg px-2 py-1.5">
                <p className="text-sm font-semibold text-textPrimary">
                  {userData?.name ?? "—"}
                </p>
                <p className="text-xs text-textSecondary">{userData?.email ?? "—"}</p>
                {userData?.role ? (
                  <p className="mt-0.5 text-xs capitalize text-textSecondary">
                    {userData.role}
                  </p>
                ) : null}
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-textPrimary shadow-sm transition hover:bg-page focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-border"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
