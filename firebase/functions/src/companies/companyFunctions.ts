import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {hlAmountToPaise} from "../entities/entityModel";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {HlError, isNotConnected, plainHlMessage, type HlGroupReportKind} from "../ledger/hlClient";
import {
  COMPANIES,
  COMPANY_REQUESTS,
  CREATE_COMPANY_ERROR_TEXT,
  MAIN_COMPANY_ID,
  MAIN_LINE,
  OWNER_ONLY_TEXT,
  bad,
  createCompanyInput,
  detailsOf,
  indiaToday,
  isDay,
  kindOfLine,
  prettyDay,
} from "./companyModel";
import {getHlClientFor, hlFields, loadCompanies, loadCompany, notInBooksYet, refreshCompanies} from "./companyStore";

/**
 * Companies (admin only — Sharnya, 28 Nov 2026). Every action goes through Humble
 * Ledger first; our companies/* docs are a mirror of what HL accepted, plus our own
 * routing (line / lineFrom). See companyModel for the model.
 */

const OPTS = {region: "us-central1", secrets: HL_SECRETS} as const;

/** HL's refusal as a message for people; `known` maps HL codes to our wording. */
function refusal(e: unknown, known: Record<string, string> = {}): HttpsError {
  if (e instanceof HttpsError) return e;
  if (isNotConnected(e)) return new HttpsError("failed-precondition", plainHlMessage(e), {code: "NOT_CONNECTED"});
  if (e instanceof HlError) {
    if (e.code && known[e.code]) return new HttpsError("failed-precondition", known[e.code], {code: e.code});
    if (e.status === 403) return new HttpsError("permission-denied", OWNER_ONLY_TEXT, {code: e.code ?? "FORBIDDEN"});
    if (e.transient) return new HttpsError("unavailable", plainHlMessage(e));
    return new HttpsError("failed-precondition", plainHlMessage(e), {code: e.code});
  }
  logger.error("Companies: unexpected error", {error: String(e)});
  return new HttpsError("internal", "Something went wrong. Try again.");
}

function companyIdOf(raw: unknown): string {
  const d = (raw ?? {}) as Record<string, unknown>;
  return typeof d.companyId === "string" && d.companyId.trim() ? d.companyId.trim() : bad("Which company?");
}

/** Re-reads HL's company list into companies/*. */
export const refreshCompaniesList = onCall(OPTS, async (request) => {
  await requireRole(request, ["admin"]);
  try {
    return await refreshCompanies(admin.firestore());
  } catch (e) {
    throw refusal(e);
  }
});

/**
 * Create Company (Tally) / "copy masters" (Busy), optionally carrying the closing
 * balances forward — the "New financial year" shortcut sends the same call with
 * everything ticked. Safe to retry: same requestId → same company.
 */
export const createCompany = onCall(OPTS, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const input = createCompanyInput(request.data);
  const db = admin.firestore();
  const reqRef = db.collection(COMPANY_REQUESTS).doc(input.requestId);
  const prev = (await reqRef.get()).data();
  if (prev?.companyId) return {companyId: prev.companyId, copied: prev.copied ?? null, alreadyDone: true};

  try {
    let companies = await loadCompanies(db);
    if (!companies.find((c) => c.id === MAIN_COMPANY_ID && c.hlCompanyId)) {
      await refreshCompanies(db);
      companies = await loadCompanies(db);
    }
    const source = input.copyFrom ? companies.find((c) => c.id === input.copyFrom?.companyId) : null;
    if (input.copyFrom && !source) throw new HttpsError("not-found", "The company to copy from doesn't exist.");
    if (source?.accessLost) throw new HttpsError("failed-precondition", `The app can no longer open ${source.name} in Humble Ledger.`);
    if (source && !source.hlCompanyId) throw new HttpsError("failed-precondition", `${source.name} isn't linked to Humble Ledger yet — open Companies once to refresh the list.`);

    const carry = input.copyFrom?.carry ?? null;
    if (carry && source) {
      const waiting = await notInBooksYet(db, source.id, carry.asOf);
      if (waiting.length) {
        throw new HttpsError(
          "failed-precondition",
          `${waiting.length} record(s) of ${source.name} dated on or before ${prettyDay(carry.asOf)} haven't reached the books yet (${waiting.slice(0, 5).join(", ")}${waiting.length > 5 ? ", …" : ""}). Fix or retry them first, so the carried balances are complete.`,
          {code: "NOT_IN_BOOKS_YET"},
        );
      }
    }

    const line = input.joinsLine === "main" ? MAIN_LINE : input.joinsLine === "source" && source ? source.line : null;
    if (line !== null) {
      const clash = companies.find((c) => c.line === line && (c.lineFrom ?? "") === input.lineFrom);
      if (clash) bad(`${clash.name} already takes over on ${prettyDay(input.lineFrom as string)}. Pick another date.`);
    }

    const hl = source ? getHlClient(source.isHome ? null : source.hlCompanyId) : getHlClient(null);
    const res = await hl.createCompany({
      name: input.name,
      fyStartMonth: input.fyStartMonth,
      ...(input.booksBeginFrom ? {booksBeginFrom: input.booksBeginFrom} : {}),
      details: input.details,
      requestId: input.requestId,
      ...(input.copyFrom && source ?
        {
          copyFrom: {
            companyId: source.hlCompanyId as string,
            accounts: input.copyFrom.accounts,
            customers: input.copyFrom.customers,
            vendors: input.copyFrom.vendors,
            members: input.copyFrom.members,
            ...(carry ? {openingBalances: {asOf: carry.asOf, pendingBills: carry.pendingBills}} : {}),
          },
        } :
        {}),
    });
    const id = res.company.id;
    const ownLine = line ?? id;
    await db.collection(COMPANIES).doc(id).set(
      {
        ...hlFields(res.company),
        id,
        line: ownLine,
        lineFrom: line !== null ? input.lineFrom : null,
        kind: kindOfLine(ownLine),
        details: input.details,
        carriedFrom: carry && source ? {companyId: source.id, name: source.name, asOf: carry.asOf, pendingBills: carry.pendingBills} : null,
        copiedFrom: input.copyFrom && source ?
          {companyId: source.id, name: source.name, accounts: input.copyFrom.accounts, customers: input.copyFrom.customers, vendors: input.copyFrom.vendors, members: input.copyFrom.members} :
          null,
        copied: res.copied,
        accessLost: false,
        madeInHl: false,
        createdBy: {uid: caller.uid, name: caller.name},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deleted: false,
      },
      {merge: true},
    );
    await reqRef.set({companyId: id, copied: res.copied, by: caller.uid, at: FieldValue.serverTimestamp()});
    return {companyId: id, copied: res.copied, alreadyDone: res.idempotent};
  } catch (e) {
    throw refusal(e, CREATE_COMPANY_ERROR_TEXT);
  }
});

/** Company info (Tally "last voucher date"): HL's profile + entry count, mirrored into our doc. */
export const getCompanyInfo = onCall(OPTS, async (request) => {
  await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const companyId = companyIdOf(request.data);
  try {
    const company = await loadCompany(db, companyId);
    const hl = await getHlClientFor(db, company.id);
    const info = await hl.getCompany();
    const lock = await hl.getBooksLock();
    await db.collection(COMPANIES).doc(company.id).set(
      {
        ...hlFields(info),
        lockedThrough: lock.lockedThrough,
        lockHistory: lock.history.slice(0, 20),
        details: info.details,
        info: {transactionCount: info.transactionCount, firstEntryDate: info.firstEntryDate, lastEntryDate: info.lastEntryDate, carriedForwardAsOf: info.carriedForwardAsOf, checkedAt: FieldValue.serverTimestamp()},
        accessLost: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return {...info, lockedThrough: lock.lockedThrough, lockHistory: lock.history};
  } catch (e) {
    if (e instanceof HlError && e.code === "COMPANY_ACCESS_REVOKED") {
      await db.collection(COMPANIES).doc(companyId).set({accessLost: true, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    throw refusal(e);
  }
});

/** Alter company (name, mailing details) — OWNER only in HL; the app's login gets a plain "ask the owner". */
export const updateCompany = onCall(OPTS, async (request) => {
  await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const d = (request.data ?? {}) as Record<string, unknown>;
  const companyId = companyIdOf(d);
  const name = typeof d.name === "string" ? d.name.replace(/\s+/g, " ").trim() : "";
  if (name.length > 100) bad("Company name must be 100 characters or fewer.");
  const details = detailsOf(d.details);
  try {
    const hl = await getHlClientFor(db, companyId);
    const info = await hl.updateCompany({...(name ? {name} : {}), details});
    await db.collection(COMPANIES).doc(companyId).set({...hlFields(info), details: info.details, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {ok: true};
  } catch (e) {
    throw refusal(e);
  }
});

/** Archive = read-only (posting refused, reports still work); unarchive undoes it. OWNER only in HL. */
export const setCompanyArchived = onCall(OPTS, async (request) => {
  await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const d = (request.data ?? {}) as Record<string, unknown>;
  const companyId = companyIdOf(d);
  if (typeof d.archived !== "boolean") bad("Archive or unarchive?");
  if (companyId === MAIN_COMPANY_ID && d.archived) bad("The main company can't be archived.");
  try {
    const hl = await getHlClientFor(db, companyId);
    await hl.setCompanyArchived(d.archived as boolean);
    await db.collection(COMPANIES).doc(companyId).set({archived: d.archived, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {ok: true};
  } catch (e) {
    throw refusal(e);
  }
});

/**
 * Close year: HL's books lock for one company (PUT /books-lock), through our ACCOUNTANT
 * login. Refused while records of that company dated in the year haven't reached the
 * books (they'd be refused for good afterwards). Reopening is the owner's job, in HL.
 */
export const closeCompanyYear = onCall(OPTS, async (request) => {
  await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const d = (request.data ?? {}) as Record<string, unknown>;
  const companyId = companyIdOf(d);
  if (!isDay(d.lockedThrough)) bad("Close up to which date? (like 2027-03-31)");
  const day = d.lockedThrough as string;
  if (day > indiaToday()) bad("A year can only be closed once it has ended — the date can't be in the future.");
  try {
    const company = await loadCompany(db, companyId);
    if (company.lockedThrough && day <= company.lockedThrough) {
      bad(`${company.name || "This company"} is already closed up to ${prettyDay(company.lockedThrough)}. Reopening a year is done by the owner in Humble Ledger.`);
    }
    const waiting = await notInBooksYet(db, company.id, day);
    if (waiting.length) {
      throw new HttpsError(
        "failed-precondition",
        `${waiting.length} record(s) dated on or before ${prettyDay(day)} haven't reached the books yet (${waiting.slice(0, 5).join(", ")}${waiting.length > 5 ? ", …" : ""}). Fix or retry them first — once the year is closed, the books would refuse them.`,
        {code: "NOT_IN_BOOKS_YET"},
      );
    }
    const hl = await getHlClientFor(db, company.id);
    const lock = await hl.setBooksLock({lockedThrough: day});
    await db.collection(COMPANIES).doc(company.id).set({lockedThrough: lock.lockedThrough, lockHistory: lock.history.slice(0, 20), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {lockedThrough: lock.lockedThrough};
  } catch (e) {
    throw refusal(e, {LOCK_DATE_IN_FUTURE: "A year can only be closed once it has ended — the date can't be in the future."});
  }
});

/**
 * Group company reports (Tally Group Company): P&L, balance sheet or trial balance over
 * 2–20 of our companies, a column per company plus the total. Amounts come back in paise.
 */
export const getGroupReport = onCall(OPTS, async (request) => {
  await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const d = (request.data ?? {}) as Record<string, unknown>;
  const kind = d.kind === "pnl" || d.kind === "balance-sheet" || d.kind === "trial-balance" ? (d.kind as HlGroupReportKind) : bad("Which report?");
  const ids = Array.isArray(d.companyIds) ? [...new Set(d.companyIds.filter((x): x is string => typeof x === "string"))] : [];
  if (ids.length < 2 || ids.length > 20) bad("Pick 2 to 20 companies.");
  let from: string | undefined;
  let to: string | undefined;
  let date: string | undefined;
  if (kind === "pnl") {
    if (!isDay(d.from) || !isDay(d.to)) bad("Pick the period (from and to).");
    from = d.from as string;
    to = d.to as string;
    if (from > to) bad("The period's start is after its end.");
  } else {
    date = isDay(d.date) ? (d.date as string) : indiaToday();
  }
  try {
    const companies = await loadCompanies(db);
    const byOurs = new Map<string, string>();
    for (const id of ids) {
      const c = companies.find((x) => x.id === id);
      if (!c?.hlCompanyId) throw new HttpsError("failed-precondition", "One of the companies isn't linked to Humble Ledger — open Companies to refresh the list.");
      byOurs.set(id, c.hlCompanyId);
    }
    const toOurs = new Map([...byOurs.entries()].map(([ours, hl]) => [hl, ours]));
    const report = await getHlClient(null).getGroupReport({kind, hlCompanyIds: [...byOurs.values()], from, to, date});
    const paise = (v: string) => {
      try {
        return hlAmountToPaise(v);
      } catch {
        return 0;
      }
    };
    const split = (by: Record<string, string>) => Object.fromEntries(Object.entries(by).map(([hl, v]) => [toOurs.get(hl) ?? hl, paise(v)]));
    return {
      kind,
      from: from ?? null,
      to: to ?? null,
      date: date ?? null,
      sections: report.sections.map((s) => ({key: s.key, lines: s.lines.map((l) => ({name: l.name, totalPaise: paise(l.total), byCompany: split(l.byCompany)}))})),
      totals: report.totals.map((t) => ({key: t.key, totalPaise: paise(t.total), byCompany: split(t.byCompany)})),
    };
  } catch (e) {
    throw refusal(e, {
      CARRIED_FORWARD_PAIR: "A year and the year it was carried from can't be added together in a balance sheet or trial balance — it would count the same money twice. Leave one of them out (the P&L can show both).",
      CURRENCY_MISMATCH: "These companies keep their books in different currencies, so they can't be added together.",
    });
  }
});
