import { FirebaseError } from "firebase/app";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Our own record of the computers the app is installed on (for Humble Solutions, not
 * shown in the app): appInstalls/{installId} — computer name, Windows/Mac, app version,
 * who last signed in, first seen, last seen. Written by the app itself on sign-in and
 * every few minutes while it's open; nobody can read it from the app (the rules say so) —
 * we read it in the Firebase console. Best effort: a failure never bothers the user.
 */
export async function checkInDevice(user: { uid: string; name: string; role: string }): Promise<void> {
  const office = window.office;
  if (!office) return; // the browser preview isn't an installed app
  try {
    const info = await office.getAppInfo();
    if (!/^[a-z0-9]{16,64}$/.test(info.installId)) return;
    const ref = doc(db, "appInstalls", info.installId);
    const fields = {
      installId: info.installId,
      computerName: info.computerName,
      platform: info.platform,
      osVersion: info.osVersion,
      appVersion: info.version,
      lastUser: { uid: user.uid, name: user.name.slice(0, 100), role: user.role },
      lastSeenAt: serverTimestamp(),
    };
    try {
      await updateDoc(ref, fields);
    } catch (e) {
      // First time on this computer: create it (with when it was first seen).
      if (e instanceof FirebaseError && (e.code === "not-found" || e.code === "permission-denied")) {
        await setDoc(ref, { ...fields, firstSeenAt: serverTimestamp() });
      } else {
        throw e;
      }
    }
  } catch {
    // Our record only — never in the user's way.
  }
}
