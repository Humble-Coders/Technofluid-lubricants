#!/usr/bin/env node

/**
 * Seed script for Firestore firms collection
 * Usage: node scripts/seedFirms.js
 *
 * Make sure you have:
 * 1. Firebase Admin SDK installed: npm install firebase-admin
 * 2. Service account key file at: firebase/serviceAccountKey.json
 */

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin
const serviceAccountPath = path.join(
  __dirname,
  "../firebase/serviceAccountKey.json"
);

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    "❌ Error: Service account key not found at:",
    serviceAccountPath
  );
  console.error(
    "\nPlease create a service account key from Firebase Console:"
  );
  console.error(
    "1. Go to https://console.firebase.google.com"
  );
  console.error(
    "2. Project Settings > Service Accounts > Generate New Private Key"
  );
  console.error("3. Save it as firebase/serviceAccountKey.json");
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const FIRMS_COLLECTION = "firms";

const SEED_DATA = {
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {
        firmName: "ABC Trading",
        address: "456 Trade Lane, Mumbai",
        location: { lat: 19.0825, lng: 72.883 },
        priorities: {
          monthly: [
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 40 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 25 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 15 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 20 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 10 },
          ],
          annually: [
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 400 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 250 },
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 150 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 200 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 100 },
          ],
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {
        firmName: "Elite Traders",
        address: "654 Business Park, Hyderabad",
        location: { lat: 17.4009, lng: 78.4594 },
        priorities: {
          monthly: [
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 50 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 35 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 25 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 20 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 25 },
          ],
          annually: [
            { productId: "prod_3", productName: "Lubricant Grade C", quantity: 500 },
            { productId: "prod_1", productName: "Lubricant Grade A", quantity: 350 },
            { productId: "prod_2", productName: "Lubricant Grade B", quantity: 250 },
            { productId: "prod_5", productName: "Gear Oil", quantity: 200 },
            { productId: "prod_4", productName: "Engine Oil", quantity: 250 },
          ],
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    ],
  },
};

async function seedFirms() {
  console.log("\n📦 Starting to seed firms collection...\n");

  try {
    let seededCount = 0;

    for (const [gstNumber, firmData] of Object.entries(SEED_DATA)) {
      const docRef = db.collection(FIRMS_COLLECTION).doc(gstNumber);

      await docRef.set({
        ...firmData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      seededCount++;
      console.log(`✅ Seeded: ${firmData.currentName} (${gstNumber})`);
    }

    console.log(`\n✨ Successfully seeded ${seededCount} firms to Firestore!\n`);
    console.log("Firms added:");
    console.log("  • 27ABCDE1234F1Z0 - ABC Trading Company");
    console.log("  • 18AABCD1234G1Z5 - Prime Distributors Ltd");
    console.log("  • 29ABCDE1234H1Z9 - Global Supplies Inc");
    console.log("  • 33ABCDE1234I1Z2 - Elite Distribution");
    console.log("  • 24AABCD1234J1Z8 - Nationwide Traders\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding firms:", error);
    process.exit(1);
  }
}

// Run the seed function
seedFirms();
