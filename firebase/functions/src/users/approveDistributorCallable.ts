import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

/**
 * Approves a salesperson-created distributor:
 *  1. Creates a Firebase Auth user for the distributor's email.
 *  2. Writes users/{authUid} and distributors/{authUid} docs (approved).
 *  3. Deletes the old placeholder distributor doc (if its id differs from the auth uid).
 *
 * After this returns, the caller should invoke sendPasswordResetEmail so the
 * distributor receives a link to set their password.
 */
export const approveDistributorCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const { distributorId } = request.data as { distributorId: string };

    if (!distributorId) {
      throw new HttpsError("invalid-argument", "Missing distributorId");
    }

    // Verify caller is admin
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "permission-denied");
    }

    // Get existing distributor doc
    const distributorDoc = await admin
      .firestore()
      .collection("distributors")
      .doc(distributorId)
      .get();

    if (!distributorDoc.exists) {
      throw new HttpsError("not-found", "Distributor not found");
    }

    const distributorData = distributorDoc.data()!;

    if (!distributorData.email) {
      throw new HttpsError("invalid-argument", "Distributor has no email address");
    }

    // Create Firebase Auth user (no password — distributor will set one via reset link)
    let authUid: string;
    try {
      const userRecord = await admin.auth().createUser({
        email: distributorData.email,
        displayName: distributorData.name ?? "",
        emailVerified: false,
      });
      authUid = userRecord.uid;
    } catch (error: any) {
      if (error.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "Email already registered");
      }
      throw new HttpsError("internal", error.message);
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = admin.firestore().batch();

    const distName: string = distributorData.name ?? "";

    // users/{authUid}
    batch.set(admin.firestore().collection("users").doc(authUid), {
      email: distributorData.email,
      name: distName,
      phone: distributorData.phone ?? "",
      role: "distributor",
      status: "approved",
      isActive: true,
      deleted: false,
      createdBy: distributorData.createdBy ?? null,
      approvedBy: request.auth.uid,
      approvedAt: now,
      createdAt: distributorData.createdAt ?? now,
      updatedAt: now,
    });

    // distributors/{authUid}
    batch.set(admin.firestore().collection("distributors").doc(authUid), {
      email: distributorData.email,
      name: distName,
      nameLower: distName.toLowerCase().trim(),
      phone: distributorData.phone ?? "",
      status: "approved",
      isActive: true,
      authCreated: true,
      deleted: false,
      createdBy: distributorData.createdBy ?? null,
      approvedBy: request.auth.uid,
      approvedAt: now,
      createdAt: distributorData.createdAt ?? now,
      updatedAt: now,
    });

    // Remove the old placeholder doc if it has a different id
    if (distributorId !== authUid) {
      batch.delete(admin.firestore().collection("distributors").doc(distributorId));
    }

    await batch.commit();

    // Return the new auth uid so the frontend can send the password reset email
    return { success: true, uid: authUid, email: distributorData.email };
  }
);
