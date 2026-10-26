import { describe, expect, it } from "vitest";
import cases from "./money-entry.cases.json";
import {
  canReverse,
  correctionFor,
  DEFAULT_CASH_REGISTER_ID,
  expenseGstSplit,
  isSameAccountAs,
  moneyDirection,
  moneyEntryError,
  moneySourceIds,
  type MoneyAccountRef,
  type MoneyEntryInput,
} from "./index";

// The same table is run against the Cloud Functions mirror (office/emulator/tests/money.test.mjs).
describe("money-entry rules (money-entry.cases.json)", () => {
  for (const c of cases.validate) {
    it(`validate: ${c.case}`, () => {
      expect(moneyEntryError(c.input as unknown as MoneyEntryInput, cases.today)).toBe(c.expect);
    });
  }
  for (const c of cases.direction) {
    it(`direction: ${c.case}`, () => {
      expect(moneyDirection({ from: c.from as MoneyAccountRef, to: c.to as MoneyAccountRef })).toBe(c.expect);
    });
  }
  for (const c of cases.gstSplit) {
    it(`GST split: ${c.case}`, () => {
      expect(expenseGstSplit(c.input)).toEqual(c.expect);
    });
  }
  for (const c of cases.correction) {
    it(`correction: ${c.case}`, () => {
      expect(correctionFor(c.target as never, c.current, c.wanted)).toEqual(c.expect);
    });
  }
});

describe("money-entry helpers", () => {
  it("same account is compared by id per kind; a rename doesn't matter", () => {
    const cash: MoneyAccountRef = { kind: "CASH", registerId: DEFAULT_CASH_REGISTER_ID, name: "Cash in hand" };
    expect(isSameAccountAs(cash, { ...cash, name: "Till" })).toBe(true);
    expect(isSameAccountAs({ kind: "ADJUSTMENT" }, { kind: "ADJUSTMENT" })).toBe(true);
    expect(isSameAccountAs(cash, { kind: "EXPENSE", categoryId: DEFAULT_CASH_REGISTER_ID, name: "x" })).toBe(false);
  });
  it("only a synced, unreversed, non-reversal entry can be reversed", () => {
    expect(canReverse({ syncStatus: "SYNCED", reversedByEntryId: null, reversesEntryId: null })).toBe(true);
    expect(canReverse({ syncStatus: "PENDING", reversedByEntryId: null, reversesEntryId: null })).toBe(false);
    expect(canReverse({ syncStatus: "SYNCED", reversedByEntryId: "m2", reversesEntryId: null })).toBe(false);
    expect(canReverse({ syncStatus: "SYNCED", reversedByEntryId: null, reversesEntryId: "m1" })).toBe(false);
  });
  it("sourceIds", () => {
    expect(moneySourceIds.entry("m1")).toBe("money_m1");
    expect(moneySourceIds.registerOpening("default-cash")).toBe("register_default-cash:opening");
  });
});
