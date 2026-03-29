// File: frontend/app/(dashboard)/admin/layout.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/layout/AdminShell";
import { useAuth } from "@/lib/useAuth";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const isAuthorized =
    !!user &&
    !!userData &&
    userData.isActive &&
    userData.status === "approved" &&
    userData.role === "admin";

  useEffect(() => {
    if (loading) return;

    // ❌ Not logged in
    if (!user) {
      router.push("/login");
      return;
    }

    // ❌ No Firestore data
    if (!userData) {
      router.push("/login");
      return;
    }

    // ❌ Not approved / inactive
    if (!userData.isActive || userData.status !== "approved") {
      router.push("/login");
      return;
    }

    // ❌ Not admin
    if (userData.role !== "admin") {
      router.replace("/dashboard"); // or wherever you want
      return;
    }
  }, [user, userData, loading, router]);

  // 🔄 Block render until auth check finishes and user is confirmed admin.
  if (loading || !isAuthorized) {
    return (
      <div className="flex h-screen items-center justify-center">
        Checking access...
      </div>
    );
  }

  // ✅ Protected content
  return <AdminShell>{children}</AdminShell>;
}
