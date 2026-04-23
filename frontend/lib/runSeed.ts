// Run this in your browser console to seed the firms collection:
// import { seedFirms } from '@/lib/seeds/firmsSeed';
// seedFirms();

export async function runFirmsSeed() {
  try {
    const { seedFirms } = await import("@/lib/seeds/firmsSeed");
    await seedFirms();
    console.log("✅ Firms seeded successfully!");
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to seed firms:", error);
    return { success: false, error };
  }
}
