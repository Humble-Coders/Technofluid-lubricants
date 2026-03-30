// File: frontend/lib/actions/createSalesperson.ts
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createUserByAdmin } from "@/lib/api/admin";

type CreateSalespersonInput = {
  name: string;
  email: string;
  phone: string;
};

export async function createSalesperson(input: CreateSalespersonInput) {
  const tempPassword = Math.random().toString(36).slice(-12) + "A1!";

  const data = await createUserByAdmin({
    email: input.email,
    password: tempPassword,
    name: input.name,
    phone: input.phone,
    role: "salesperson",
  });

  await sendPasswordResetEmail(auth, input.email);

  return { success: true, uid: data.uid };
}
