import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {checkGstin} from "../entities/entityModel";
import {COMPANY_DOC, COMPANY_ERROR_TEXT, OFFICE_SETTINGS, bad, companyError, type CompanyProfile} from "./saleModel";

/**
 * Admin: who the seller is — printed on every invoice (legal name, GSTIN, address) and
 * the invoice-number prefix. Sales are refused until it is complete. A new prefix only
 * starts a series: once a financial year has invoices, its numbers keep their prefix.
 */

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const orNull = (v: string) => v || null;

export function companyRef(db: admin.firestore.Firestore) {
  return db.collection(OFFICE_SETTINGS).doc(COMPANY_DOC);
}

export const saveCompanyProfile = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const d = (request.data ?? {}) as Record<string, unknown>;
  const a = (d.address ?? {}) as Record<string, unknown>;
  const gstin = text(d.gstin, 20).replace(/\s+/g, "").toUpperCase();
  const profile: Omit<CompanyProfile, "stateCode"> = {
    legalName: text(d.legalName, 120),
    tradeName: orNull(text(d.tradeName, 120)),
    gstin,
    address: {line1: text(a.line1, 160), line2: text(a.line2, 160), city: text(a.city, 60), pincode: text(a.pincode, 6)},
    phone: orNull(text(d.phone, 30)),
    email: orNull(text(d.email, 120)),
    invoicePrefix: text(d.invoicePrefix, 3).toUpperCase(),
  };
  const code = companyError(profile);
  if (code) bad(COMPANY_ERROR_TEXT[code], code);
  const check = checkGstin(gstin);
  const stateCode = check.valid ? check.stateCode : "";
  await companyRef(admin.firestore()).set({
    ...profile,
    stateCode,
    updatedBy: {uid: caller.uid, name: caller.name},
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {saved: true, stateCode};
});
