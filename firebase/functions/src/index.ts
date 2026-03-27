import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: string;
}

export const createUserByAdmin = functions.https.onCall<CreateUserRequest>(
  async (request) => {
    const { data, auth } = request;

    // 🔐 Must be logged in
    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be logged in"
      );
    }

    const { email, password, name, role } = data;

    // 🔐 Validate input
    if (!email || !password || !name || !role) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    // 🔐 Check admin role
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(auth.uid)
      .get();

    const callerData = callerDoc.data();

    if (!callerData || callerData.role !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can create users"
      );
    }

    try {
      // 🔥 Create Auth user
      const userRecord = await admin.auth().createUser({
        email,
        password,
      });

      const uid = userRecord.uid;

      // 🔥 Create Firestore user
      await admin.firestore().collection("users").doc(uid).set({
        email,
        name,
        role,
        status: "approved",
        isActive: true,

        distributorCount: 0,
        ordersCount: 0,

        createdBy: auth.uid,
        approvedBy: auth.uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 🔥 Distributor collection
      if (role === "distributor") {
        await admin.firestore().collection("distributors").doc(uid).set({
          email,
          name,
          status: "approved",
          isActive: true,
          createdBy: auth.uid,
          approvedBy: auth.uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return { success: true };
    } catch (error) {
      console.error("Create user error:", error);

      throw new functions.https.HttpsError(
        "internal",
        "Failed to create user"
      );
    }
  }
);