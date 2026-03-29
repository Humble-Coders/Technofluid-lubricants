// File: frontend/lib/actions/createSalesperson.ts
import { getIdToken, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

type CreateSalespersonInput = {
  name: string;
  email: string;
  phone: string;
};

export async function createSalesperson(input: CreateSalespersonInput) {
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
        role: "salesperson",
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || errorData.error || "Failed to create salesperson");
  }

  const data = await response.json();

  await sendPasswordResetEmail(auth, input.email);

  return { success: true, uid: data.uid };
}
