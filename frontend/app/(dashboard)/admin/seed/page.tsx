"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SeedPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSeedFirms = async () => {
    setIsLoading(true);
    setMessage(null);
    setMessage({
      type: "error",
      text: "Firm seeding is disabled in this build.",
    });
    setIsLoading(false);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-2xl font-bold text-textPrimary mb-2">
          Database Seeding
        </h1>
        <p className="text-sm text-textSecondary mb-4">
          Firm seeding has been disabled.
        </p>

        <div className="space-y-4 mb-6 rounded-lg bg-page p-4">
          <h2 className="font-semibold text-textPrimary">Status</h2>
          <p className="text-sm text-textSecondary">
            This page no longer seeds firm data. Use live firm creation through
            visit logging instead.
          </p>
        </div>

        <Button
          onClick={handleSeedFirms}
          isLoading={isLoading}
          className="w-full"
          variant="secondary"
        >
          {isLoading ? "Checking..." : "Firm Seeding Disabled"}
        </Button>

        {message && (
          <div
            className={`mt-4 rounded-lg p-4 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
