import * as admin from "firebase-admin";
import {FieldPath, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {HttpsError} from "firebase-functions/v2/https";

import {getHlClient} from "../ledger/getHlClient";
import {HL_MAX_PAGE, type HlAccountType, type HlClient, type HlCompanySummary} from "../ledger/hlClient";
import {getOrCreateAccount} from "../money/hlAccounts";
import {COMPANIES, MAIN_COMPANY_ID, MAIN_LINE, companyForDate, kindOfLine, prettyDay, type CompanyRow} from "./companyModel";

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

// ─── Posting into a company's books ──────────────────────────────────────────────
//
// The main company keeps today's pinned ids (entity.hlCustomerId, register.hlAccountId,
// category.hlAccountId). In any other company the same party / register / category is
// found by its OWN id — HL customers by externalId (= entity id, kept when HL copies
// customers), accounts by the "· <doc id>" every account name we make ends with (kept when
// HL copies accounts, and safe from renames) — and remembered in companies/{id}/links/{docId}.

export const isMainCompany = (companyId: unknown) => !companyId || companyId === MAIN_COMPANY_ID;

/** The client for one of our companies, made from the run's (home) client. */
export async function booksFor(db: admin.firestore.Firestore, hl: HlClient, companyId: string | null | undefined): Promise<HlClient> {
  if (isMainCompany(companyId)) return hl;
  const c = await loadCompany(db, companyId);
  if (!c.hlCompanyId) throw new HttpsError("failed-precondition", `${c.name || "That company"} isn't linked to Humble Ledger.`);
  return hl.forCompany(c.hlCompanyId);
}

const linkRef = (db: admin.firestore.Firestore, companyId: string, docId: string) => db.collection(COMPANIES).doc(companyId).collection("links").doc(docId);

/** An HL account of ours in a (non-main) company, found by its doc id; made only when `create`. */
export async function companyAccount(
  db: admin.firestore.Firestore,
  books: HlClient,
  companyId: string,
  docId: string,
  type: HlAccountType,
  name: string,
  create = true,
): Promise<string | null> {
  const ref = linkRef(db, companyId, docId);
  const linked = (await ref.get()).data();
  if (typeof linked?.hlAccountId === "string") return linked.hlAccountId;
  const suffix = `· ${docId}`.toLowerCase();
  let found: string | null = null;
  for (let page = 1; page <= 50 && !found; page++) {
    const res = await books.listAccounts({type, search: docId, page, limit: HL_MAX_PAGE});
    found = res.data.find((a) => a.name.trim().toLowerCase().endsWith(suffix) || a.name.toLowerCase().includes(`${suffix} ·`))?.id ?? null;
    if (!res.hasMore) break;
  }
  if (!found && create) found = (await getOrCreateAccount(books, name, type)).id;
  if (found) await ref.set({hlAccountId: found, at: FieldValue.serverTimestamp()}, {merge: true});
  return found;
}

/** A party's HL customer in a (non-main) company: created (idempotent on externalId) when missing. */
export async function companyCustomer(
  db: admin.firestore.Firestore,
  books: HlClient,
  companyId: string,
  entityId: string,
  entity: admin.firestore.DocumentData,
): Promise<{customerId: string; accountId: string}> {
  const ref = linkRef(db, companyId, entityId);
  const linked = (await ref.get()).data();
  if (typeof linked?.hlCustomerId === "string" && typeof linked?.hlAccountId === "string") return {customerId: linked.hlCustomerId, accountId: linked.hlAccountId};
  const profile = partyProfile(entity);
  const made = await books.createCustomer({externalId: entityId, ...profile});
  // Already there (copied by HL with the year, or made earlier): bring its details up to date.
  const customer = made.idempotent ? await books.updateCustomer(made.customer.id, profile) : made.customer;
  await ref.set({kind: "party", entityId, hlCustomerId: customer.id, hlAccountId: customer.accountId, at: FieldValue.serverTimestamp()}, {merge: true});
  return {customerId: customer.id, accountId: customer.accountId};
}

/**
 * Where a record dated `day` goes, starting from the company it was entered in: the company
 * of that company's line that owns the day (a late entry for last year goes to last year's
 * company; one in the new year to the new year's). Refuses an archived company, one the app
 * can't open, or a closed year.
 */
export async function routeToCompany(db: admin.firestore.Firestore, companyId: string | null | undefined, day: string, what = "The date"): Promise<CompanyDoc> {
  const companies = await loadCompanies(db);
  const start = companies.find((c) => c.id === (companyId || MAIN_COMPANY_ID)) ?? (isMainCompany(companyId) ? await loadCompany(db, MAIN_COMPANY_ID) : null);
  if (!start) throw new HttpsError("not-found", "That company doesn't exist (or was removed).");
  const routed = companyForDate(companies.length ? companies : [start], start.line, day) ?? start;
  if (routed.archived) throw new HttpsError("failed-precondition", `${routed.name} is archived (read-only) — nothing can be added to it.`, {code: "COMPANY_ARCHIVED"});
  if (routed.accessLost) throw new HttpsError("failed-precondition", `The app can no longer open ${routed.name} in Humble Ledger.`, {code: "COMPANY_ACCESS_REVOKED"});
  assertOpenDay(routed, day, what);
  return routed;
}

/**
 * The company a READ is for (balances, statements): `raw` is the companyId the app sent;
 * only Admin may read another company than main. Returns the company and its books.
 */
export async function companyToRead(db: admin.firestore.Firestore, role: string, raw: unknown, home: HlClient): Promise<{company: CompanyDoc; books: HlClient; isMain: boolean}> {
  const asked = typeof raw === "string" && raw.trim() ? raw.trim() : MAIN_COMPANY_ID;
  const company = await loadCompany(db, asked);
  // Accounts reads the main business (any of its financial years); a person's books are Admin's.
  if (company.line !== MAIN_LINE && role !== "admin") throw new HttpsError("permission-denied", "Only an Admin can open another company.");
  return {company, books: await booksFor(db, home, company.id), isMain: isMainCompany(company.id)};
}

/** HL profile of a party (blanks left out — HL rejects ""). Phones: the first one. */
export function partyProfile(entity: admin.firestore.DocumentData): {name: string; phone?: string; email?: string; gstin?: string} {
  const opt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const phone = opt(Array.isArray(entity.phones) ? entity.phones[0] : entity.phone);
  return {
    name: String(entity.name ?? "Party"),
    ...(phone ? {phone} : {}),
    ...(opt(entity.email) ? {email: opt(entity.email)} : {}),
    ...(opt(entity.gstin) ? {gstin: opt(entity.gstin)} : {}),
  };
}

/**
 * A party's name / phone / email / GSTIN changed: update its copy in every other company
 * that already has it (main is synced by syncEntity). Best effort — a failure is logged and
 * the next edit (or first use, which also refreshes the details) catches up; balances are
 * never affected.
 */
export async function updatePartyInCompanies(db: admin.firestore.Firestore, home: HlClient, entityId: string, entity: admin.firestore.DocumentData): Promise<number> {
  let updated = 0;
  for (const c of await loadCompanies(db)) {
    if (isMainCompany(c.id) || !c.hlCompanyId || c.accessLost) continue;
    const link = (await linkRef(db, c.id, entityId).get()).data();
    if (typeof link?.hlCustomerId !== "string") continue;
    try {
      await home.forCompany(c.hlCompanyId).updateCustomer(link.hlCustomerId, partyProfile(entity));
      updated++;
    } catch (e) {
      logger.warn("Couldn't update a party in another company", {entityId, companyId: c.id, error: e instanceof Error ? e.message : String(e)});
    }
  }
  return updated;
}

/**
 * Records made before companies existed have no line / companyId: they are the main
 * business's. Stamped once (officeSettings/companies.stampedLine), so the security rules can
 * keep other companies' money records from Accounts. Safe to re-run.
 */
export async function stampMainLine(db: admin.firestore.Firestore): Promise<{stamped: number; already: boolean}> {
  const marker = db.collection("officeSettings").doc("companies");
  if ((await marker.get()).data()?.stampedLine === true) return {stamped: 0, already: true};
  let stamped = 0;
  for (const collection of ["moneyEntries", "registers"]) {
    let last: admin.firestore.QueryDocumentSnapshot | null = null;
    for (;;) {
      let q = db.collection(collection).orderBy(FieldPath.documentId()).limit(400);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      const batch = db.batch();
      let n = 0;
      for (const d of snap.docs) {
        const v = d.data();
        if (typeof v.line === "string" && (collection === "registers" || typeof v.companyId === "string")) continue;
        batch.set(d.ref, collection === "registers" ? {line: v.line ?? MAIN_LINE} : {line: v.line ?? MAIN_LINE, companyId: v.companyId ?? MAIN_COMPANY_ID}, {merge: true});
        n++;
      }
      if (n) await batch.commit();
      stamped += n;
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) break;
    }
  }
  await marker.set({stampedLine: true, stampedAt: FieldValue.serverTimestamp(), stamped}, {merge: true});
  return {stamped, already: false};
}
