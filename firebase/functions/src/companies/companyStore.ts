import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {getHlClient} from "../ledger/getHlClient";
import {type HlClient, type HlCompanySummary} from "../ledger/hlClient";
import {COMPANIES, MAIN_COMPANY_ID, MAIN_LINE, kindOfLine, prettyDay, type CompanyRow} from "./companyModel";

/** Our record of a company, as the functions read it. */
export interface CompanyDoc extends CompanyRow {
  name: string;
  hlCompanyId: string | null;
  isHome: boolean;
  lockedThrough: string | null;
  booksBeginFrom: string | null;
  accessLost: boolean;
}

export function toCompanyDoc(id: string, d: admin.firestore.DocumentData): CompanyDoc {
  return {
    id,
    name: String(d.name ?? ""),
    hlCompanyId: typeof d.hlCompanyId === "string" ? d.hlCompanyId : null,
    isHome: id === MAIN_COMPANY_ID,
    line: typeof d.line === "string" ? d.line : id === MAIN_COMPANY_ID ? MAIN_LINE : id,
    lineFrom: typeof d.lineFrom === "string" ? d.lineFrom : null,
    archived: d.archived === true,
    deleted: d.deleted === true,
    lockedThrough: typeof d.lockedThrough === "string" ? d.lockedThrough : null,
    booksBeginFrom: typeof d.booksBeginFrom === "string" ? d.booksBeginFrom : null,
    accessLost: d.accessLost === true,
  };
}

export async function loadCompanies(db: admin.firestore.Firestore): Promise<CompanyDoc[]> {
  const snap = await db.collection(COMPANIES).get();
  return snap.docs.map((d) => toCompanyDoc(d.id, d.data())).filter((c) => !c.deleted);
}

/**
 * One of our companies. "main" always exists (made from the HL home company on first use),
 * so callers that pass nothing keep working before anyone has opened the Companies screen.
 */
export async function loadCompany(db: admin.firestore.Firestore, companyId: string | null | undefined): Promise<CompanyDoc> {
  const id = companyId || MAIN_COMPANY_ID;
  const snap = await db.collection(COMPANIES).doc(id).get();
  if (snap.exists && snap.data()?.deleted !== true) return toCompanyDoc(id, snap.data() as admin.firestore.DocumentData);
  if (id === MAIN_COMPANY_ID) return toCompanyDoc(MAIN_COMPANY_ID, {line: MAIN_LINE, name: ""});
  throw new HttpsError("not-found", "That company doesn't exist (or was removed).");
}

/** The HL client that posts into one of OUR companies (main = the login's home company). */
export async function getHlClientFor(db: admin.firestore.Firestore, companyId: string | null | undefined): Promise<HlClient> {
  if (!companyId || companyId === MAIN_COMPANY_ID) return getHlClient(null);
  const c = await loadCompany(db, companyId);
  if (!c.hlCompanyId) throw new HttpsError("failed-precondition", `${c.name || "That company"} isn't linked to Humble Ledger.`);
  return getHlClient(c.hlCompanyId);
}

/**
 * Pulls HL's company list (GET /auth/companies) into companies/*: the home company is
 * "main"; others keep their HL id as doc id. A company made in the HL dashboard shows up
 * as its own money-only line. One the login can no longer open is kept, marked accessLost
 * — never deleted (its records still point at it).
 */
export async function refreshCompanies(db: admin.firestore.Firestore, hl: HlClient = getHlClient(null)): Promise<{count: number}> {
  const list = await hl.listCompanies();
  const existing = new Map((await db.collection(COMPANIES).get()).docs.map((d) => [d.id, d.data()]));
  const seen = new Set<string>();
  const batch = db.batch();
  for (const c of list) {
    const id = c.isHome ? MAIN_COMPANY_ID : c.id;
    seen.add(id);
    const prev = existing.get(id);
    const fromHl = hlFields(c);
    if (prev) {
      batch.set(db.collection(COMPANIES).doc(id), {...fromHl, accessLost: false, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    } else {
      const line = c.isHome ? MAIN_LINE : id;
      batch.set(db.collection(COMPANIES).doc(id), {
        ...fromHl,
        id,
        line,
        lineFrom: null,
        kind: kindOfLine(line),
        details: {},
        carriedFrom: null,
        copied: null,
        accessLost: false,
        madeInHl: !c.isHome,
        createdBy: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deleted: false,
      });
    }
  }
  for (const [id, d] of existing) {
    if (!seen.has(id) && d.deleted !== true && d.accessLost !== true) {
      batch.set(db.collection(COMPANIES).doc(id), {accessLost: true, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
  }
  await batch.commit();
  return {count: list.length};
}

export function hlFields(c: HlCompanySummary) {
  return {
    name: c.name,
    hlCompanyId: c.id,
    currency: c.currency,
    fyStartMonth: c.fyStartMonth,
    booksBeginFrom: c.booksBeginFrom,
    lockedThrough: c.lockedThrough,
    archived: c.archived,
    hlRole: c.role,
  };
}

/** Records of a company dated on or before `day` that haven't reached its books yet. */
export async function notInBooksYet(db: admin.firestore.Firestore, companyId: string, day: string): Promise<string[]> {
  const waiting: string[] = [];
  const sources: [string, string, (d: admin.firestore.DocumentData) => string][] = [
    ["sales", "invoiceDate", (d) => `invoice ${d.invoiceNo ?? ""}`.trim()],
    ["purchases", "billDate", (d) => `purchase ${d.ref ?? ""}`.trim()],
    ["moneyEntries", "businessDay", () => "money entry"],
  ];
  for (const [collection, dateField, label] of sources) {
    const snap = await db.collection(collection).where("syncStatus", "in", ["PENDING", "FAILED"]).limit(400).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.deleted === true || (d.companyId ?? MAIN_COMPANY_ID) !== companyId) continue;
      if (typeof d[dateField] === "string" && d[dateField] <= day) waiting.push(label(d));
    }
  }
  return waiting;
}

/** Refuses a date in a company's closed year, before anything is written (code BOOKS_LOCKED). */
export function assertOpenDay(company: CompanyDoc, day: string, what = "The date"): void {
  if (company.lockedThrough && day <= company.lockedThrough) {
    throw new HttpsError(
      "failed-precondition",
      `${what} (${prettyDay(day)}) is in a closed year of ${company.name || "this company"}. Its books are closed up to ${prettyDay(company.lockedThrough)}.`,
      {code: "BOOKS_LOCKED", lockedThrough: company.lockedThrough},
    );
  }
  if (company.booksBeginFrom && day < company.booksBeginFrom) {
    throw new HttpsError("failed-precondition", `${what} (${prettyDay(day)}) is before ${company.name || "this company"}'s books begin (${prettyDay(company.booksBeginFrom)}).`, {code: "BEFORE_BOOKS_BEGIN"});
  }
}
