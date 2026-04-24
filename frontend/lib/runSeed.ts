export async function runFirmsSeed() {
  console.warn("Firm seeding is disabled in this build.");
  return {
    success: false,
    error: new Error("Firm seeding is disabled in this build."),
  };
}
