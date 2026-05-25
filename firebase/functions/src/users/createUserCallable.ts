import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

export const createUserByAdminCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const { email, password, name, role, phone } = request.data;

    if (!email || !password || !name || !role) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();
    const callerData = callerDoc.data();

    if (!callerData || callerData.role !== "admin") {
      throw new HttpsError("permission-denied", "permission-denied");
    }

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password });
    } catch (error: any) {
      if (error.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "Email already registered");
      }
      throw new HttpsError("internal", error.message);
    }

    const uid = userRecord.uid;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await admin.firestore().collection("users").doc(uid).set({
      email,
      name,
      role,
      phone: phone ?? "",
      status: "approved",
      isActive: true,
      deleted: false,
      createdBy: request.auth.uid,
      approvedBy: request.auth.uid,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (role === "distributor") {
      await admin.firestore().collection("distributors").doc(uid).set({
        email,
        name,
        nameLower: (name as string).toLowerCase().trim(),
        phone: phone ?? "",
        status: "approved",
        isActive: true,
        deleted: false,
        createdBy: request.auth.uid,
        approvedBy: request.auth.uid,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true, uid };
  }
);
