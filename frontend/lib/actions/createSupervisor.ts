// File: frontend/lib/actions/createSupervisor.ts
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createUserByAdmin } from "@/lib/api/admin";

type CreateSupervisorInput = {
  name: string;
  email: string;
  phone: string;
};

export async function createSupervisor(input: CreateSupervisorInput) {
  const tempPassword = Math.random().toString(36).slice(-12) + "A1!";

  const data = await createUserByAdmin({
    email: input.email,
    password: tempPassword,
    name: input.name,
    phone: input.phone,
    role: "supervisor",
  });

  await sendPasswordResetEmail(auth, input.email);

  return { success: true, uid: data.uid };
}
