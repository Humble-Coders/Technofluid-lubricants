// File: frontend/lib/actions/createDistributor.ts
import { getIdToken, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

type CreateDistributorInput = {
  name: string;
  email: string;
  phone: string;
};

export async function createDistributor(input: CreateDistributorInput) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to create users");
  }

  const token = await getIdToken(currentUser);
  const tempPassword = Math.random().toString(36).slice(-12) + "A1!";

  const response = await fetch(
    "https://us-central1-hs-website-21095.cloudfunctions.net/createUserByAdmin",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: input.email,
        password: tempPassword,
        name: input.name,
        phone: input.phone,
        role: "distributor",
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || errorData.error || "Failed to create distributor");
  }

  const data = await response.json();

  await sendPasswordResetEmail(auth, input.email);

  return { success: true, uid: data.uid };
}
