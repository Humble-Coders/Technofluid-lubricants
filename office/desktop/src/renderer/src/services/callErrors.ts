import { FirebaseError } from "firebase/app";
import { FUNCTIONS_EMULATOR, usingEmulators } from "@/lib/firebase";

/**
 * Turns a failed Cloud Function call into a sentence a person can act on.
 * Validation / permission errors carry the server's own message.
 */
export async function friendlyError(error: unknown): Promise<string> {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/invalid-argument":
      case "functions/not-found":
      case "functions/already-exists":
      case "functions/failed-precondition":
      case "functions/permission-denied":
      case "functions/unauthenticated":
        return error.message;
    }
  }
  // In development the "server" is the local emulator — the usual cause of a failed
  // save is that it isn't running (or was started without Cloud Functions).
  if (usingEmulators && !(await functionsEmulatorAnswers())) {
    return "Can't save — the Firebase emulator isn't running. Start it with \"npm run emulators\" in the office folder, then try again.";
  }
  if (!navigator.onLine) return "You're offline. Changes can only be saved when the internet is back.";
  if (
    error instanceof FirebaseError &&
    (error.code === "functions/unavailable" || error.code === "functions/deadline-exceeded")
  ) {
    return "Couldn't reach the server. Check the internet and try again.";
  }
  return "Something went wrong while saving. Please try again.";
}

/** True if anything is listening on the Functions emulator port. */
async function functionsEmulatorAnswers(): Promise<boolean> {
  try {
    // "no-cors": we only care whether the port answers, not what it says.
    await fetch(`http://${FUNCTIONS_EMULATOR.host}:${FUNCTIONS_EMULATOR.port}/`, {
      mode: "no-cors",
      signal: AbortSignal.timeout(1500),
    });
    return true;
  } catch {
    return false;
  }
}
