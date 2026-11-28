import { describe, expect, it } from "vitest";
import { companyForDate, companyFormErrors, companyPeriod, companyPeriodIn, nextYearDates, yearEndOf, yearLabel, yearStartOf } from "./company";

describe("companies", () => {
  const list = [
    { id: "main", line: "main", lineFrom: null },
    { id: "y27", line: "main", lineFrom: "2027-04-01" },
    { id: "ravi", line: "ravi", lineFrom: null },
    { id: "gone", line: "main", lineFrom: "2027-10-01", deleted: true },
  ];

  it("routes a date to the line's latest company on or before it", () => {
    expect(companyForDate(list, "main", "2027-03-31")?.id).toBe("main");
    expect(companyForDate(list, "main", "2027-04-01")?.id).toBe("y27");
    expect(companyForDate(list, "main", "2028-01-01")?.id).toBe("y27");
    expect(companyForDate(list, "ravi", "2020-01-01")?.id).toBe("ravi");
    expect(companyForDate(list, "x", "2020-01-01")).toBeNull();
  });

  it("works out financial years", () => {
    expect(yearStartOf("2026-11-28")).toBe("2026-04-01");
    expect(yearStartOf("2027-02-10")).toBe("2026-04-01");
    expect(yearStartOf("2027-02-10", 1)).toBe("2027-01-01");
    expect(yearEndOf("2026-04-01")).toBe("2027-03-31");
    expect(yearEndOf("2028-01-01")).toBe("2028-12-31");
    expect(yearLabel("2026-04-01")).toBe("2026-27");
    expect(yearLabel("2099-04-01")).toBe("2099-00");
    expect(yearLabel("2027-01-01")).toBe("2027");
  });

  it("labels a company by the year it covers", () => {
    expect(companyPeriod({ booksBeginFrom: "2027-04-01", fyStartMonth: 4 })).toBe("FY 2027-28");
    expect(companyPeriod({ booksBeginFrom: "2027-06-15", fyStartMonth: 4 })).toBe("From 15 Jun 2027");
    expect(companyPeriod({ booksBeginFrom: null, fyStartMonth: 4 })).toBe("Year starts in Apr");
    expect(companyPeriod({ booksBeginFrom: "2026-04-01", fyStartMonth: 4, lineFrom: "2027-04-01" })).toBe("FY 2027-28");
  });

  it("says where the next year takes over", () => {
    const rows = [
      { id: "main", line: "main", lineFrom: null, booksBeginFrom: null, fyStartMonth: 4 },
      { id: "y26", line: "main", lineFrom: "2026-04-01", booksBeginFrom: "2026-04-01", fyStartMonth: 4 },
    ];
    expect(companyPeriodIn(rows[0]!, rows)).toBe("Up to 31 Mar 2026");
    expect(companyPeriodIn(rows[1]!, rows)).toBe("FY 2026-27");
  });

  it("suggests the next year's dates for the New financial year shortcut", () => {
    // The first company (no start date), in Nov 2026: the year that ended is 2025-26.
    expect(nextYearDates({ booksBeginFrom: null, fyStartMonth: 4, lockedThrough: null }, "2026-11-28")).toEqual({ asOf: "2026-03-31", booksBeginFrom: "2026-04-01" });
    // A 2026-27 company continues into 2027-28.
    expect(nextYearDates({ booksBeginFrom: "2026-04-01", fyStartMonth: 4, lockedThrough: null }, "2027-05-01")).toEqual({ asOf: "2027-03-31", booksBeginFrom: "2027-04-01" });
    // A company closed through a later year continues from that one.
    expect(nextYearDates({ booksBeginFrom: "2026-04-01", fyStartMonth: 4, lockedThrough: "2028-03-31" }, "2028-05-01")).toEqual({ asOf: "2028-03-31", booksBeginFrom: "2028-04-01" });
    // The first company, closed through the year that just ended: the next year follows it.
    expect(nextYearDates({ booksBeginFrom: null, fyStartMonth: 4, lockedThrough: "2027-03-31" }, "2027-05-01")).toEqual({ asOf: "2027-03-31", booksBeginFrom: "2027-04-01" });
  });

  it("checks the company form", () => {
    const ok = { name: "Technofluid Lubricants", booksBeginFrom: "2027-04-01", carry: true, asOf: "2027-03-31", joinsMain: true, lineFrom: "2027-04-01" };
    expect(companyFormErrors(ok)).toEqual({});
    expect(companyFormErrors({ ...ok, name: " " }).name).toBeTruthy();
    expect(companyFormErrors({ ...ok, booksBeginFrom: "2027-03-31" }).booksBeginFrom).toMatch(/after the closing date/);
    expect(companyFormErrors({ ...ok, lineFrom: "2027-03-01" }).lineFrom).toMatch(/before its own books/);
    expect(companyFormErrors({ ...ok, carry: false, booksBeginFrom: "", joinsMain: false })).toEqual({});
  });
});
