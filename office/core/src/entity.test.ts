import { describe, expect, it } from "vitest";
import cases from "./entity.cases.json";
import {
  balanceDirection,
  checkEntityInput,
  hlAmountToPaise,
  hlProfileChanged,
  normalizePhone,
  sourceGroup,
  sourceIds,
  stateCodeFromGstin,
  WALK_IN_ENTITY_ID,
  type HlProfile,
} from "./index";

// The same table is run against the Cloud Functions mirror (office/emulator/tests/entities.test.mjs).
describe("entity rules (entity.cases.json)", () => {
  for (const c of cases.validate) {
    it(`validate: ${c.case}`, () => {
      const r = checkEntityInput(c.input);
      if (c.expect.ok) {
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toMatchObject(c.expect.value as object);
      } else {
        expect(r.ok).toBe(false);
        if (!r.ok) expect([...new Set(r.errors.map((e) => e.code))].sort()).toEqual([...(c.expect as { codes: string[] }).codes].sort());
      }
    });
  }
  it("phone normalisation", () => {
    for (const c of cases.phone) expect(normalizePhone(c.input)).toBe(c.expect);
  });
  it("HL amounts are read from strings, without floats", () => {
    for (const c of cases.hlAmount) {
      if (c.expect === "error") expect(() => hlAmountToPaise(c.input)).toThrow();
      else expect(hlAmountToPaise(c.input)).toBe(c.expect);
    }
  });
  for (const c of cases.profileChanged) {
    it(`HL profile changed: ${c.case}`, () => {
      expect(hlProfileChanged(c.before as HlProfile, c.after as HlProfile)).toBe(c.expect);
    });
  }
});

describe("entity helpers", () => {
  it("balance direction, state from GSTIN, walk-in id", () => {
    expect([balanceDirection(5), balanceDirection(-5), balanceDirection(0)]).toEqual(["receivable", "payable", "settled"]);
    expect(stateCodeFromGstin("06AABCT1234F1ZU")).toBe("06");
    expect(stateCodeFromGstin("06AABCT1234F1ZA")).toBeNull();
    expect(WALK_IN_ENTITY_ID).toBe("walk-in-customer");
  });
  it("sourceIds are deterministic and group by the part before ':'", () => {
    expect(sourceIds.opening("ab12")).toBe("entity_ab12:opening");
    expect(sourceGroup(sourceIds.sale("s1", "gst"))).toBe("sale_s1");
    expect(sourceGroup(sourceIds.payment("p1"))).toBe("payment_p1");
  });
});
