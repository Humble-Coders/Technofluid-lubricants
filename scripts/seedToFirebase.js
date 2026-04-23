#!/usr/bin/env node

/**
 * Standalone Firestore Seed Script
 * Direct write to Firebase without Admin SDK
 *
 * Usage: node scripts/seedToFirebase.js
 *
 * Requirements:
 * - .env.local file in frontend/ with NEXT_PUBLIC_FIREBASE_* variables
 */

const fs = require("fs");
const path = require("path");

// Load environment variables from .env.local
const envPath = path.join(__dirname, "../frontend/.env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ Error: .env.local not found at:", envPath);
  console.error("\nCreate .env.local in frontend/ with:");
  console.error("  NEXT_PUBLIC_FIREBASE_API_KEY=...");
  console.error("  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...");
  console.error("  NEXT_PUBLIC_FIREBASE_PROJECT_ID=...");
  console.error("  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...");
  console.error("  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...");
  console.error("  NEXT_PUBLIC_FIREBASE_APP_ID=...");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf-8");
envContent.split("\n").forEach((line) => {
  const [key, value] = line.split("=");
  if (key && value && key.startsWith("NEXT_PUBLIC_")) {
    process.env[key] = value.trim();
  }
});

// Now import Firebase
const { initializeApp } = require("firebase/app");
const { getFirestore, setDoc, doc, serverTimestamp } = require("firebase/firestore");

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate config
const missingVars = Object.entries(firebaseConfig)
  .filter(([_, v]) => !v)
  .map(([k]) => k);

if (missingVars.length > 0) {
  console.error("❌ Missing environment variables:");
  missingVars.forEach((v) => console.error(`   - ${v}`));
  process.exit(1);
}

// Seed data
const FIRMS_DATA = {
  "27ABCDE1234F1Z0": {
    gstNumber: "27ABCDE1234F1Z0",
    currentName: "ABC Trading Company",
    currentAddress: "123 Business Street, Mumbai",
    currentLocation: { lat: 19.076, lng: 72.8479 },
    defaultPriorities: {
      monthly: [
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 50 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 30 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 20 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 25 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 15 },
      ],
      annually: [
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 500 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 300 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 200 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 250 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 150 },
      ],
    },
    history: [
      {
        firmName: "ABC Trading Company",
        address: "123 Business Street, Mumbai",
        location: { lat: 19.076, lng: 72.8479 },
        priorities: {
          monthly: [
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 50 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 30 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 20 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 25 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 15 },
          ],
          annually: [
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 500 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 300 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 200 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 250 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 150 },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  },
  "18AABCD1234G1Z5": {
    gstNumber: "18AABCD1234G1Z5",
    currentName: "Prime Distributors Ltd",
    currentAddress: "456 Commerce Road, Delhi",
    currentLocation: { lat: 28.7041, lng: 77.1025 },
    defaultPriorities: {
      monthly: [
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 60 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 40 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 35 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 20 },
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 25 },
      ],
      annually: [
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 600 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 400 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 350 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 200 },
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 250 },
      ],
    },
    history: [
      {
        firmName: "Prime Distributors Ltd",
        address: "456 Commerce Road, Delhi",
        location: { lat: 28.7041, lng: 77.1025 },
        priorities: {
          monthly: [
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 60 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 40 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 35 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 20 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 25 },
          ],
          annually: [
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 600 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 400 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 350 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 200 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 250 },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  },
  "29ABCDE1234H1Z9": {
    gstNumber: "29ABCDE1234H1Z9",
    currentName: "Global Supplies Inc",
    currentAddress: "789 Industrial Avenue, Bangalore",
    currentLocation: { lat: 12.9716, lng: 77.5946 },
    defaultPriorities: {
      monthly: [
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 45 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 35 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 30 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 25 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 18 },
      ],
      annually: [
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 450 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 350 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 300 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 250 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 180 },
      ],
    },
    history: [
      {
        firmName: "Global Supplies Inc",
        address: "789 Industrial Avenue, Bangalore",
        location: { lat: 12.9716, lng: 77.5946 },
        priorities: {
          monthly: [
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 45 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 35 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 30 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 25 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 18 },
          ],
          annually: [
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 450 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 350 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 300 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 250 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 180 },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  },
  "33ABCDE1234I1Z2": {
    gstNumber: "33ABCDE1234I1Z2",
    currentName: "Elite Distribution",
    currentAddress: "321 Market Lane, Hyderabad",
    currentLocation: { lat: 17.385, lng: 78.4867 },
    defaultPriorities: {
      monthly: [
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 55 },
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 40 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 30 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 22 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 28 },
      ],
      annually: [
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 550 },
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 400 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 300 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 220 },
        { productId: "prod_4", productName: "Engine Oil", quantity: 280 },
      ],
    },
    history: [
      {
        firmName: "Elite Distribution",
        address: "321 Market Lane, Hyderabad",
        location: { lat: 17.385, lng: 78.4867 },
        priorities: {
          monthly: [
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 55 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 40 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 30 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 22 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 28 },
          ],
          annually: [
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 550 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 400 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 300 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 220 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 280 },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  },
  "24AABCD1234J1Z8": {
    gstNumber: "24AABCD1234J1Z8",
    currentName: "Nationwide Traders",
    currentAddress: "654 Trade Park, Pune",
    currentLocation: { lat: 18.5204, lng: 73.8567 },
    defaultPriorities: {
      monthly: [
        { productId: "prod_4", productName: "Engine Oil", quantity: 50 },
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 35 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 25 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 28 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 20 },
      ],
      annually: [
        { productId: "prod_4", productName: "Engine Oil", quantity: 500 },
        { productId: "prod_1", productName: "Lubricant Grade A", quantity: 350 },
        { productId: "prod_5", productName: "Gear Oil", quantity: 250 },
        { productId: "prod_2", productName: "Lubricant Grade B", quantity: 280 },
        { productId: "prod_3", productName: "Lubricant Grade C", quantity: 200 },
      ],
    },
    history: [
      {
        firmName: "Nationwide Traders",
        address: "654 Trade Park, Pune",
        location: { lat: 18.5204, lng: 73.8567 },
        priorities: {
          monthly: [
            { productId: "prod_4", productName: "Engine Oil", quantity: 50 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 35 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 25 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 28 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 20 },
          ],
          annually: [
            { productId: "prod_4", productName: "Engine Oil", quantity: 500 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 350 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 250 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 280 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 200 },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  },
};

async function seedFirebase() {
  try {
    console.log("\n🔥 Initializing Firebase...");
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    console.log("✅ Firebase initialized");
    console.log(`📦 Seeding ${Object.keys(FIRMS_DATA).length} firms...\n`);

    let seededCount = 0;
    for (const [gstNumber, firmData] of Object.entries(FIRMS_DATA)) {
      try {
        const docRef = doc(db, "firms", gstNumber);
        await setDoc(docRef, {
          ...firmData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ ${firmData.currentName}`);
        seededCount++;
      } catch (error) {
        console.error(`❌ ${gstNumber}: ${error.message}`);
      }
    }

    console.log(`\n🎉 Successfully seeded ${seededCount} firms!\n`);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nTroubleshooting:");
    console.error("  1. Check .env.local exists in frontend/");
    console.error("  2. Verify Firebase credentials are correct");
    console.error("  3. Check internet connection");
    console.error("  4. Ensure Firestore database is enabled in Firebase Console\n");
    process.exit(1);
  }
}

seedFirebase();
