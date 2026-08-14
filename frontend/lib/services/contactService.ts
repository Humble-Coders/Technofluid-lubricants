// File: frontend/lib/services/contactService.ts
// Public-site contact form → Firestore. Writes are rule-validated server-side
// (anonymous create allowed on this collection only, shape-checked).

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ContactMessageInput {
  name: string;
  phone: string;
  message: string;
}

const COLLECTION = "contactMessages";

export async function submitContactMessage(
  input: ContactMessageInput,
): Promise<string> {
  const doc = await addDoc(collection(db, COLLECTION), {
    name: input.name.trim(),
    phone: input.phone.trim(),
    message: input.message.trim(),
    status: "new",
    source: "website",
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return doc.id;
}
