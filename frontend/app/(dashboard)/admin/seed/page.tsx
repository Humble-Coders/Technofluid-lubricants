"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { seedFirms } from "@/lib/seeds/firmsSeed";

export default function SeedPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSeedFirms = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      await seedFirms();
      setMessage({
        type: "success",
        text: "✅ Successfully seeded 5 firms to Firestore! You can now use the GST numbers in the log visit form.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: `❌ Failed to seed data: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-2xl font-bold text-textPrimary mb-2">Database Seeding</h1>
        <p className="text-sm text-textSecondary mb-4">
          Populate the firms collection with sample data for testing.
        </p>

        <div className="space-y-4 mb-6 rounded-lg bg-page p-4">
          <h2 className="font-semibold text-textPrimary">Firms to be seeded:</h2>
          <ul className="space-y-2 text-sm text-textSecondary">
            <li>✓ <strong>27ABCDE1234F1Z0</strong> - ABC Trading Company (Mumbai)</li>
            <li>✓ <strong>18AABCD1234G1Z5</strong> - Prime Distributors Ltd (Delhi)</li>
            <li>✓ <strong>29ABCDE1234H1Z9</strong> - Global Supplies Inc (Bangalore)</li>
            <li>✓ <strong>33ABCDE1234I1Z2</strong> - Elite Distribution (Hyderabad)</li>
            <li>✓ <strong>24AABCD1234J1Z8</strong> - Nationwide Traders (Pune)</li>
          </ul>
          <p className="text-xs text-textSecondary italic mt-3">
            Each firm includes sample priorities (monthly/annual) and multiple address history entries for testing branch detection.
          </p>
        </div>

        <Button onClick={handleSeedFirms} isLoading={isLoading} className="w-full">
          {isLoading ? "Seeding..." : "Seed Firms Collection"}
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
