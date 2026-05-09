// File: frontend/lib/actions/createDistributor.ts
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/constants";
import { createUserByAdmin } from "@/lib/api/admin";
import { saveDistributorFirmData } from "@/lib/services/firmService";

type CreateDistributorInput = {
  name: string;
  email: string;
  phone: string;
  gstNumber?: string;
  address?: string;
  serviceArea?: string;
  productCategories?: string[];
};

export async function createDistributor(input: CreateDistributorInput) {
  const tempPassword = Math.random().toString(36).slice(-12) + "A1!";

  const data = await createUserByAdmin({
    email: input.email,
    password: tempPassword,
    name: input.name,
    phone: input.phone,
    role: "distributor",
  });

  await sendPasswordResetEmail(auth, input.email);

  if (data.uid) {
    const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, data.uid);
    await setDoc(
      distributorRef,
      {
        name: input.name,
        email: input.email,
        phone: input.phone,
        contactInfo: input.phone,
        ...(input.gstNumber ? { gstNumber: input.gstNumber } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.serviceArea ? { serviceArea: input.serviceArea } : {}),
        ...(input.productCategories?.length
          ? { productCategories: input.productCategories }
          : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (input.gstNumber) {
    saveDistributorFirmData(input.gstNumber, input.name, input.address).catch(() => {});
  }

  return { success: true, uid: data.uid };
}
