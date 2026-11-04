/**
 * Real-books test runs (start-real-books.mjs): the local emulators, but posting to
 * Technofluid's REAL Humble Ledger company. The run marks itself in its own emulator data
 * (officeSettings/emulatorMode {realBooks: true}); the app then shows "REAL BOOKS", and
 * the sample-data scripts that would post to the books refuse to run.
 */
export const REAL_BOOKS_DOC = "officeSettings/emulatorMode";

/** Exits (code 1) if the running emulators post to the real books. */
export async function refuseOnRealBooks(db, what) {
  const mode = (await db.doc(REAL_BOOKS_DOC).get()).data();
  if (mode?.realBooks === true) {
    console.error(`\n✋ Not running ${what}: these emulators post to Technofluid's REAL books (npm run emulators:real-books).`);
    console.error("   Sample data would land in the real ledger for good. Stop them and use `npm run emulators` for practice data.\n");
    process.exit(1);
  }
}
