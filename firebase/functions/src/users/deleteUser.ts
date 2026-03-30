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

    await admin.auth().deleteUser(uid);
    await admin.firestore().collection("users").doc(uid).delete();

    if (targetRole === "distributor") {
      await admin.firestore().collection("distributors").doc(uid).delete();
    }

    return { success: true };
  }
);
