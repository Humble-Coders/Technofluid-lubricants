/**
 * One-off: moves dealer/distributor prices off products/{sku} into
 * product_prices/{sku} (readable by admin + accounts only), then removes the
 * price fields from the product doc.
 *
 * Safe to re-run: a product that already has a product_prices doc keeps that
 * doc (it is newer — written by the office app or the website admin), and only
 * its leftover legacy fields are removed.
 *
 * Dry run by default — prints what it would do. Add --write to change data.
 *
 *   Local emulator:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-product-prices.mjs --project demo-technofluid --write
 *   Live:            node scripts/migrate-product-prices.mjs --project techno-fluid [--write]
 *                    (uses your gcloud Application Default Credentials)
 *
 * Order on live: deploy the website + functions first (they read both places),
 * then run this, then deploy the rules.
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
const write = args.includes("--write");
if (!args.includes("--project") || !project || project.startsWith("--")) {
  console.error("Usage: node scripts/migrate-product-prices.mjs --project <id> [--write]");
  process.exit(1);
}

const PRICE_FIELDS = ["pricePer", "dealerPrice", "distributorPrice"];
const db = getFirestore(initializeApp({ projectId: project }));

const [products, prices] = await Promise.all([
  db.collection("products").get(),
  db.collection("product_prices").get(),
]);
const hasPriceDoc = new Set(prices.docs.map((d) => d.id));

let moved = 0;
let cleaned = 0;
let untouched = 0;
let batch = db.batch();
let ops = 0;
const flush = async () => {
  if (write && ops > 0) await batch.commit();
  batch = db.batch();
  ops = 0;
};

for (const doc of products.docs) {
  const data = doc.data();
  const legacy = PRICE_FIELDS.filter((f) => f in data);
  if (legacy.length === 0) {
    untouched += 1;
    continue;
  }
  if (hasPriceDoc.has(doc.id)) {
    cleaned += 1;
  } else {
    moved += 1;
    batch.set(db.collection("product_prices").doc(doc.id), {
      pricePer: data.pricePer ?? null,
      dealerPrice: data.dealerPrice ?? null,
      distributorPrice: data.distributorPrice ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    ops += 1;
  }
  batch.update(doc.ref, Object.fromEntries(legacy.map((f) => [f, FieldValue.delete()])));
  ops += 1;
  if (ops >= 400) await flush();
}
await flush();

console.log(
  `${write ? "Done" : "DRY RUN — nothing written (add --write)"} on ${project}: ` +
    `${products.size} products — ${moved} prices moved to product_prices, ` +
    `${cleaned} already had a price doc (legacy fields removed), ${untouched} had no prices on the product doc.`,
);
