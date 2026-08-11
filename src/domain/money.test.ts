import { describe, expect, it } from "vitest";

import {
  assertCents,
  centsToEuros,
  eurosToCents,
  formatEur,
  formatEurSigned,
  formatPercent,
  MoneyError,
  multiplyCents,
  parseEurosToCents,
  ratio,
  scaleCents,
  sumCents,
} from "./money";

describe("eurosToCents", () => {
  it("converts whole euros", () => {
    expect(eurosToCents(40)).toBe(4000);
  });

  it("converts amounts that naive float arithmetic gets wrong", () => {
    // 40.1 * 100 === 4009.999999999999 in IEEE-754.
    expect(eurosToCents(40.1)).toBe(4010);
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
  });

  it("cannot recover precision already lost by the caller's literal", () => {
    // 1.005 is stored as 1.00499999999999989, so this rounds DOWN. This is a
    // limitation of numeric input, not of the conversion — which is exactly why
    // user-entered text goes through parseEurosToCents instead.
    expect(eurosToCents(1.005)).toBe(100);
    expect(parseEurosToCents("1.005")).toBe(101);
  });

  it("rejects non-finite input", () => {
    expect(() => eurosToCents(Number.NaN)).toThrow(MoneyError);
    expect(() => eurosToCents(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe("assertCents", () => {
  it("rejects fractional cents, which would mean a float leaked in", () => {
    expect(() => assertCents(10.5)).toThrow(MoneyError);
  });

  it("rejects values beyond safe integer precision", () => {
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });

  it("accepts zero and negatives (a P&L line can be negative)", () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(-500)).toBe(-500);
  });
});

describe("sumCents", () => {
  it("sums exactly where floats would drift", () => {
    // 0.10 + 0.20 !== 0.30 in floating point; in cents it is exact.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 10 }, () => 10))).toBe(100);
  });

  it("returns zero for an empty list", () => {
    expect(sumCents([])).toBe(0);
  });

  it("handles very large totals", () => {
    expect(sumCents([100_000_000_00, 50_000_000_00])).toBe(150_000_000_00);
  });
});

describe("multiplyCents", () => {
  it("multiplies by a whole quantity", () => {
    expect(multiplyCents(4000, 10)).toBe(40_000);
  });

  it("returns zero for a zero quantity", () => {
    expect(multiplyCents(4000, 0)).toBe(0);
  });

  it("refuses a fractional quantity, which would produce fractional cents", () => {
    expect(() => multiplyCents(4000, 1.5)).toThrow(MoneyError);
  });
});

describe("scaleCents", () => {
  it("scales by a fractional factor and rounds to whole cents", () => {
    expect(scaleCents(2500, 1.5)).toBe(3750);
    expect(scaleCents(333, 1 / 3)).toBe(111);
  });

  it("rounds half away from zero, symmetrically for negatives", () => {
    expect(scaleCents(1, 0.5)).toBe(1);
    expect(scaleCents(-1, 0.5)).toBe(-1);
  });

  it("returns zero when scaled by zero", () => {
    expect(scaleCents(9999, 0)).toBe(0);
  });
});

describe("ratio", () => {
  it("divides normally", () => {
    expect(ratio(1, 4)).toBe(0.25);
  });

  it("returns null instead of Infinity or NaN when dividing by zero", () => {
    expect(ratio(100, 0)).toBeNull();
    expect(ratio(0, 0)).toBeNull();
  });
});

describe("parseEurosToCents", () => {
  it("parses plain and currency-prefixed input", () => {
    expect(parseEurosToCents("40")).toBe(4000);
    expect(parseEurosToCents("€ 40.50")).toBe(4050);
  });

  it("parses both European and Anglo thousand/decimal conventions", () => {
    expect(parseEurosToCents("1.234,56")).toBe(123_456);
    expect(parseEurosToCents("1,234.56")).toBe(123_456);
  });

  it("returns null for blank or malformed input", () => {
    expect(parseEurosToCents("")).toBeNull();
    expect(parseEurosToCents("abc")).toBeNull();
    expect(parseEurosToCents("-")).toBeNull();
    expect(parseEurosToCents("1.2.3")).toBeNull();
  });

  it("parses without ever creating a float, so no precision is lost", () => {
    expect(parseEurosToCents("0.1")).toBe(10);
    expect(parseEurosToCents("0.01")).toBe(1);
    expect(parseEurosToCents(".5")).toBe(50);
    expect(parseEurosToCents("1.005")).toBe(101); // half-up on the third decimal
    expect(parseEurosToCents("1.004")).toBe(100);
    expect(parseEurosToCents("-12.34")).toBe(-1234);
    expect(parseEurosToCents("8.999")).toBe(900);
  });
});

describe("formatting", () => {
  it("formats cents as EUR", () => {
    expect(formatEur(104_000)).toContain("1,040.00");
    expect(formatEur(104_000)).toContain("€");
  });

  it("renders an em dash for missing values rather than €0.00", () => {
    expect(formatEur(null)).toBe("—");
    expect(formatPercent(null)).toBe("—");
  });

  it("signs variance amounts explicitly", () => {
    expect(formatEurSigned(20_000)).toMatch(/^\+/);
    expect(formatEurSigned(-20_000)).toMatch(/^-/);
    expect(formatEurSigned(0)).not.toMatch(/^[+-]/);
  });

  it("formats percentages to one decimal by default", () => {
    expect(formatPercent(0.34666)).toBe("34.7%");
  });

  it("round-trips euros through cents", () => {
    expect(centsToEuros(eurosToCents(123.45))).toBe(123.45);
  });
});
