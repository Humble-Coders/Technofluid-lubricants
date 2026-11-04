import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Staff profile = the `users/{uid}` document the website already maintains
 * (written by the createUser Cloud Function: name, role, status, isActive, deleted).
 */
export interface StaffProfile {
  uid: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isActive: boolean;
  deleted: boolean;
}

/** Live profile, so a deactivated or re-roled user is signed out of screens immediately. */
export function watchStaffProfile(
  uid: string,
  onChange: (profile: StaffProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const d = snap.data();
      onChange({
        uid,
        name: typeof d.name === "string" && d.name.trim() ? d.name : "Unnamed user",
        email: typeof d.email === "string" ? d.email : "",
        role: typeof d.role === "string" ? d.role : "",
        status: typeof d.status === "string" ? d.status : "",
        isActive: d.isActive === true,
        deleted: d.deleted === true,
      });
    },
    onError,
  );
}
