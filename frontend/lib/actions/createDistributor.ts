// File: frontend/lib/actions/createDistributor.ts
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/constants";
import { createUserByAdmin } from "@/lib/api/admin";
import { saveDistributorFirmData, saveDistributorFirmDataNoGst } from "@/lib/services/firmService";
import type { AssignedProduct, DistributorType, Territory } from "@/types/distributor";

type CreateDistributorInput = {
  name: string;
  email: string;
  phone: string;
  createdBy?: string;
  gstNumber?: string;
  address?: string;
  assignedProducts?: AssignedProduct[];
  distributorType?: DistributorType;
  territory?: Territory;
  linkedFirmId?: string;
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
        nameLower: input.name.toLowerCase().trim(),
        email: input.email,
        phone: input.phone,
        deleted: false,
        createdBy: input.createdBy ?? "",
        ...(input.gstNumber ? { gstNumber: input.gstNumber } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.assignedProducts?.length
          ? { assignedProducts: input.assignedProducts }
          : {}),
        ...(input.distributorType ? { distributorType: input.distributorType } : {}),
        ...(input.territory?.states.length ? { territory: input.territory } : {}),
        ...(input.linkedFirmId ? { linkedFirmId: input.linkedFirmId } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (input.gstNumber) {
    saveDistributorFirmData(input.gstNumber, input.name, input.address).catch(() => {});
  } else {
    saveDistributorFirmDataNoGst(input.name, input.address).catch(() => {});
  }

  return { success: true, uid: data.uid };
}
