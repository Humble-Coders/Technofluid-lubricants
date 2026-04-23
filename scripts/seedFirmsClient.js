#!/usr/bin/env node

/**
 * Client-side seed script using the API endpoint
 * Usage: node scripts/seedFirmsClient.js [url] [secret]
 *
 * Examples:
 *   node scripts/seedFirmsClient.js
 *   node scripts/seedFirmsClient.js http://localhost:3000 custom-secret
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";
const SEED_SECRET = process.argv[3] || "dev-seed-secret";

async function seedFirms() {
  const endpoint = `${BASE_URL}/api/admin/seed-firms`;

  console.log(`🌱 Seeding firms via: ${endpoint}`);
  console.log(`Secret: ${SEED_SECRET.substring(0, 5)}...`);
  console.log("");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SEED_SECRET}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Error: ${response.status}`);
      console.error(data.error || "Unknown error");
      process.exit(1);
    }

    console.log(`✅ ${data.message}`);
    console.log("");
    console.log("Results:");
    data.results.forEach((result) => console.log(`  ${result}`));

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to connect:", error.message);
    console.error("");
    console.error("Make sure:");
    console.error("  1. Next.js dev server is running (npm run dev)");
    console.error("  2. Base URL is correct");
    console.error("  3. Firebase is properly configured");
    process.exit(1);
  }
}

seedFirms();
