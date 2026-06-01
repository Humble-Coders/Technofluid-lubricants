import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

export const deleteUser = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const { uid } = request.data as { uid: string };

    if (!uid) {
      throw new HttpsError("invalid-argument", "Missing uid");
    }

    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "permission-denied");
    }

    const targetDoc = await admin.firestore().collection("users").doc(uid).get();
    const targetRole = targetDoc.data()?.role;

    // Auth user is hard-deleted so the email can be reused.
    // Ignore user-not-found — auth may have been cleaned up already.
    try {
      await admin.auth().deleteUser(uid);
    } catch (error: any) {
      if (error.code !== "auth/user-not-found") throw error;
    }

    // Firestore documents are soft-deleted to preserve audit history.
    const now = admin.firestore.FieldValue.serverTimestamp();
    const softDelete = {
      deleted: true,
      deletedAt: now,
      deletedBy: request.auth.uid,
    };

    // Use set+merge so the write succeeds even if the doc was already deleted
    // or never fully created.
    const batch = admin.firestore().batch();
    batch.set(admin.firestore().collection("users").doc(uid), softDelete, { merge: true });
    if (targetRole === "distributor") {
      batch.set(
        admin.firestore().collection("distributors").doc(uid),
        softDelete,
        { merge: true },
      );
    }
    await batch.commit();

    return { success: true };
  },
);
