import * as admin from "firebase-admin";
import {HttpsError, type CallableRequest} from "firebase-functions/v2/https";

export type StaffRole =
  | "admin"
  | "accounts"
  | "supervisor"
  | "salesperson"
  | "distributor";

export interface Caller {
  uid: string;
  name: string;
  role: StaffRole;
}

/**
 * The one place a Cloud Function checks who is calling.
 *
 * Today it reads users/{uid} (role + approved + active + not deleted). The
 * security step of the plan switches this to Firebase custom claims, so every
 * caller changes at once — don't re-implement role checks elsewhere.
 */
export async function requireRole(
  request: CallableRequest,
  roles: readonly StaffRole[],
): Promise<Caller> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in again.");
  }

  const snap = await admin
    .firestore()
    .collection("users")
    .doc(request.auth.uid)
    .get();
  const user = snap.data();

  const allowed =
    user !== undefined &&
    user.deleted !== true &&
    user.isActive === true &&
    user.status === "approved" &&
    (roles as readonly string[]).includes(user.role);
  if (!allowed) {
    throw new HttpsError(
      "permission-denied",
      "You don't have permission to do this.",
    );
  }

  return {
    uid: request.auth.uid,
    name: typeof user.name === "string" ? user.name : "",
    role: user.role as StaffRole,
  };
}
