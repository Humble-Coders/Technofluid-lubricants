export type GstLookupResult = {
  gstNumber: string;
  firmName: string;
  address?: string;
};

// Mock GST database - replace with API call later
const MOCK_GST_DATA: Record<string, GstLookupResult> = {
  "27ABCDE1234F1Z0": {
    gstNumber: "27ABCDE1234F1Z0",
    firmName: "ABC Trading Company",
    address: "123 Business Street, Mumbai",
  },
  "18AABCD1234G1Z5": {
    gstNumber: "18AABCD1234G1Z5",
    firmName: "Prime Distributors Ltd",
    address: "456 Commerce Road, Delhi",
  },
  "29ABCDE1234H1Z9": {
    gstNumber: "29ABCDE1234H1Z9",
    firmName: "Global Supplies Inc",
    address: "789 Industrial Avenue, Bangalore",
  },
  "33ABCDE1234I1Z2": {
    gstNumber: "33ABCDE1234I1Z2",
    firmName: "Elite Distribution",
    address: "321 Market Lane, Hyderabad",
  },
  "24AABCD1234J1Z8": {
    gstNumber: "24AABCD1234J1Z8",
    firmName: "Nationwide Traders",
    address: "654 Trade Park, Pune",
  },
};

export async function lookupGstNumber(
  gstNumber: string,
): Promise<GstLookupResult | null> {
  try {
    const trimmedGst = gstNumber.trim().toUpperCase();

    // Check mock database first
    if (MOCK_GST_DATA[trimmedGst]) {
      return MOCK_GST_DATA[trimmedGst];
    }

    // For testing - return null if not found (user can enter manually)
    return null;
  } catch (error) {
    console.error("Error looking up GST:", error);
    return null;
  }
}
