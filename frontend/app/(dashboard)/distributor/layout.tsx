// File: frontend/app/(dashboard)/distributor/layout.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DistributorShell } from "@/components/layout/DistributorShell";
import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";

export default function DistributorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  const isAuthorized =
    !!user &&
    !!userData &&
    userData.isActive &&
    userData.status === "approved" &&
    userData.role === USER_ROLES.DISTRIBUTOR;

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

    // ❌ Not distributor
    if (userData.role !== USER_ROLES.DISTRIBUTOR) {
      router.replace("/dashboard");
      return;
    }
  }, [user, userData, loading, router]);

  // 🔄 Block render until auth check finishes
  if (loading || !isAuthorized) {
    return (
      <div className="flex h-screen items-center justify-center">
        Checking access...
      </div>
    );
  }

  // ✅ Protected content
  return <DistributorShell>{children}</DistributorShell>;
}
