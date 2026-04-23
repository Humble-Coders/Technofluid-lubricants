import { NextRequest, NextResponse } from "next/server";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const SEED_SECRET = process.env.SEED_SECRET || "dev-seed-secret";
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
      },
    ],
  },
};

export async function POST(request: NextRequest) {
  try {
    // Verify secret
    const authHeader = request.headers.get("authorization");
    const secret = authHeader?.replace("Bearer ", "");

    if (secret !== SEED_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Seed the database
    let seededCount = 0;
    const results: string[] = [];

    for (const [gstNumber, firmData] of Object.entries(SEED_DATA)) {
      try {
        const docRef = doc(db, FIRMS_COLLECTION, gstNumber);
        await setDoc(docRef, {
          ...firmData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        seededCount++;
        results.push(`✅ ${firmData.currentName}`);
      } catch (error) {
        results.push(`❌ ${gstNumber}: ${error}`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully seeded ${seededCount} firms`,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
