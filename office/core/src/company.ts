/**
 * Companies — real separate books, one per Humble Ledger company (Tally-style; Ansh,
 * 28 Nov 2026). Pure helpers shared by the screens; the server's copy of the rules lives
 * in firebase/functions/src/companies/companyModel.ts.
 *
 *  - Our home company is always "main". A record without a companyId belongs to it.
 *  - Every company is on a LINE: "main" = the main business (sales, purchases, stock,
 *    website orders); any other line is a separate, money-only set of books. A new
 *    financial year continues a line from `lineFrom`: records dated on or after it go to
 *    the new company.
 */

export const MAIN_COMPANY_ID = "main";
export const MAIN_LINE = "main";

export interface CompanyRouting {
  id: string;
  line: string;
  /** null = from the beginning (the first company of its line). */
  lineFrom: string | null;
  deleted?: boolean;
}

/** The company of a line that owns a date: the latest lineFrom on or before it. */
export function companyForDate<T extends CompanyRouting>(companies: readonly T[], line: string, day: string): T | null {
  let best: T | null = null;
  for (const c of companies) {
    if (c.deleted === true || c.line !== line) continue;
    const from = c.lineFrom ?? "";
    if (from > day) continue;
    if (!best || from > (best.lineFrom ?? "")) best = c;
  }
  return best;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-04-01" → "1 Apr 2027". */
export function prettyDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The financial year (starting in `fyStartMonth`) a day falls in, as its first day. */
export function yearStartOf(day: string, fyStartMonth = 4): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  return `${m >= fyStartMonth ? y : y - 1}-${pad(fyStartMonth)}-01`;
}

/** The last day of the financial year that starts on `start` ("2026-04-01" → "2027-03-31"). */
export function yearEndOf(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "2026-04-01" → "2026-27" (a year starting in January → "2027"). */
export function yearLabel(start: string): string {
  const y = Number(start.slice(0, 4));
  return start.slice(5, 7) === "01" ? String(y) : `${y}-${pad((y + 1) % 100)}`;
}

/**
 * What tells same-named companies apart in a list: the year their books cover ("FY
 * 2027-28"), else when they begin, else the financial-year month.
 */
export function companyPeriod(c: { booksBeginFrom: string | null; fyStartMonth: number | null; lineFrom?: string | null }): string {
  const begin = c.lineFrom ?? c.booksBeginFrom;
  const fy = c.fyStartMonth ?? 4;
  if (begin) {
    const start = yearStartOf(begin, fy);
    return start === begin ? `FY ${yearLabel(start)}` : `From ${prettyDay(begin)}`;
  }
  return `Year starts in ${MONTHS[fy - 1]}`;
}

/**
 * companyPeriod, plus where a later company of the same line takes over: the first company
 * of the main business, continued from 1 Apr 2026, reads "Up to 31 Mar 2026".
 */
export function companyPeriodIn<T extends CompanyRouting & { booksBeginFrom: string | null; fyStartMonth: number | null }>(c: T, companies: readonly T[]): string {
  const next = companies
    .filter((x) => x.deleted !== true && x.line === c.line && x.id !== c.id && x.lineFrom && x.lineFrom > (c.lineFrom ?? ""))
    .sort((a, b) => (a.lineFrom as string).localeCompare(b.lineFrom as string))[0];
  if (!next?.lineFrom || (c.lineFrom ?? c.booksBeginFrom)) return companyPeriod(c);
  const end = new Date(`${next.lineFrom}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return `Up to ${prettyDay(end.toISOString().slice(0, 10))}`;
}

/**
 * The "New financial year" shortcut's dates, from the company it continues: carry the
 * closing balances of the year that has ended (as of its last day) into books beginning
 * the next day. Based on the company's own period, else the year `today` is in.
 */
export function nextYearDates(c: { booksBeginFrom: string | null; lineFrom?: string | null; fyStartMonth: number | null; lockedThrough: string | null }, today: string): { asOf: string; booksBeginFrom: string } {
  const fy = c.fyStartMonth ?? 4;
  const begin = c.lineFrom ?? c.booksBeginFrom;
  // The year this company covers: its own first year, or (for the first company of a line,
  // with no start date) the year before the current one — the one that has just ended.
  const start = begin ? yearStartOf(begin, fy) : (() => {
    const current = yearStartOf(today, fy);
    return `${Number(current.slice(0, 4)) - 1}${current.slice(4)}`;
  })();
  // Once a later year is closed, continue from the last closed year instead.
  const closed = c.lockedThrough ? yearStartOf(c.lockedThrough, fy) : null;
  const from = closed && closed > start ? closed : start;
  const asOf = yearEndOf(from);
  const next = new Date(`${asOf}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { asOf, booksBeginFrom: next.toISOString().slice(0, 10) };
}

/** Problems with the Add-company / New-year form, by field; empty = OK to send. */
export function companyFormErrors(f: {
  name: string;
  booksBeginFrom: string;
  carry: boolean;
  asOf: string;
  joinsMain: boolean;
  lineFrom: string;
}): Partial<Record<"name" | "booksBeginFrom" | "asOf" | "lineFrom", string>> {
  const e: Partial<Record<"name" | "booksBeginFrom" | "asOf" | "lineFrom", string>> = {};
  if (!f.name.trim()) e.name = "Give the company a name.";
  else if (f.name.trim().length > 100) e.name = "At most 100 characters.";
  if (f.carry) {
    if (!f.asOf) e.asOf = "Pick the closing date of the old year.";
    if (!f.booksBeginFrom) e.booksBeginFrom = "Pick the day the new books begin.";
    else if (f.asOf && f.booksBeginFrom <= f.asOf) e.booksBeginFrom = "The new books must begin after the closing date.";
  }
  if (f.joinsMain) {
    if (!f.lineFrom && !f.booksBeginFrom) e.lineFrom = "From which date should it take over?";
    else if (f.lineFrom && f.booksBeginFrom && f.lineFrom < f.booksBeginFrom) e.lineFrom = "It can't take over before its own books begin.";
  }
  return e;
}
