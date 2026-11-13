import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {checkGstin} from "../entities/entityModel";
import {COMPANY_DOC, COMPANY_ERROR_TEXT, OFFICE_SETTINGS, bad, companyError, type CompanyBank, type CompanyProfile} from "./saleModel";

/**
 * Admin: who the seller is — printed on every invoice (legal name, GSTIN, address) and
 * the invoice-number prefix; optionally the bank details and terms printed on the invoice.
 * Sales are refused until the required parts are complete. A new prefix only
 * starts a series: once a financial year has invoices, its numbers keep their prefix.
 */

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const orNull = (v: string) => v || null;

/** Bank details for the invoice: all five parts, or none. */
function bankOf(v: unknown): CompanyBank | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const bank = {name: text(b.name, 60), branch: text(b.branch, 60), accountType: text(b.accountType, 20), accountNo: text(b.accountNo, 30).replace(/\s+/g, ""), ifsc: text(b.ifsc, 40).replace(/\s+/g, "").toUpperCase()};
  if (!Object.values(bank).some(Boolean)) return null;
  if (!bank.name || !bank.accountNo || !bank.ifsc) bad("Bank details need at least the bank name, account number and IFSC code.");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc)) bad("The IFSC code should look like HDFC0002185 (11 characters).");
  if (!/^\d{6,20}$/.test(bank.accountNo)) bad("The account number should be 6 to 20 digits.");
  return bank;
}

/** Terms & conditions: up to 8 lines of up to 200 characters. */
function termsOf(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const lines = v.map((x) => text(x, 200)).filter(Boolean);
  if (lines.length > 8) bad("At most 8 lines of terms & conditions.");
  return lines.length ? lines : null;
}

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
    bank: bankOf(d.bank),
    invoiceTerms: termsOf(d.invoiceTerms),
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
