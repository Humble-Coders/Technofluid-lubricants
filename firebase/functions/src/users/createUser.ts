import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { corsHandler } from "../config/cors";

interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: string;
  phone?: string;
}

export const createUserByAdmin = onRequest(
  { region: "us-central1", invoker: "public" },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          res.status(401).json({ error: "unauthenticated" });
          return;
        }

        const token = authHeader.substring(7);
        let decodedToken;
        try {
          decodedToken = await admin.auth().verifyIdToken(token);
        } catch {
          res.status(401).json({ error: "unauthenticated" });
          return;
        }

        const { email, password, name, role, phone } = req.body as CreateUserRequest;

        if (!email || !password || !name || !role) {
          res.status(400).json({ error: "invalid-argument", message: "Missing required fields" });
          return;
        }

        const callerDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
        const callerData = callerDoc.data();

        if (!callerData || callerData.role !== "admin") {
          res.status(403).json({ error: "permission-denied" });
          return;
        }

        const userRecord = await admin.auth().createUser({ email, password });
        const uid = userRecord.uid;
        const now = admin.firestore.FieldValue.serverTimestamp();

        await admin.firestore().collection("users").doc(uid).set({
          email,
          name,
          role,
          phone: phone ?? "",
          status: "approved",
          isActive: true,
          distributorCount: 0,
          ordersCount: 0,
          createdBy: decodedToken.uid,
          approvedBy: decodedToken.uid,
          approvedAt: now,
          createdAt: now,
          updatedAt: now,
        });

        if (role === "distributor") {
          await admin.firestore().collection("distributors").doc(uid).set({
            email,
            name,
            phone: phone ?? "",
            contactInfo: phone ?? "",
            status: "approved",
            isActive: true,
            createdBy: decodedToken.uid,
            approvedBy: decodedToken.uid,
            approvedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }

        res.json({ success: true, uid });
      } catch (error: any) {
        console.error("Error creating user:", error);
        if (error.code === "auth/email-already-exists") {
          res.status(400).json({ error: "already-exists", message: "Email already registered" });
        } else {
          res.status(500).json({ error: "internal", message: error.message });
        }
      }
    });
  }
);
