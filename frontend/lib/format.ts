// File: frontend/lib/format.ts

/** Formats integer paise as a ₹ string, e.g. 15000 -> "₹150.00". */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** Converts a ₹ amount (string or number, as typed in a form) to integer paise. */
export function rupeesToPaise(rupees: string | number): number {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  return Math.round(n * 100);
}

/** Converts integer paise to a ₹ amount suitable for a numeric form input. */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}
