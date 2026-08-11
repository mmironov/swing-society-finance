import { describe, expect, it } from "vitest";

import { isIsoDate, weeksBetween } from "./seasons";

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-09-15")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects wrong formats and impossible dates", () => {
    expect(isIsoDate("15/09/2026")).toBe(false);
    expect(isIsoDate("2026-9-5")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("")).toBe(false);
  });
});

describe("weeksBetween", () => {
  it("covers the Autumn 2026 season in 14 weeks", () => {
    // 15 Sep – 20 Dec 2026 is 97 inclusive days.
    expect(weeksBetween("2026-09-15", "2026-12-20")).toBe(14);
  });

  it("counts a single day as one week", () => {
    expect(weeksBetween("2026-09-15", "2026-09-15")).toBe(1);
  });

  it("counts an exact week as one week", () => {
    expect(weeksBetween("2026-09-15", "2026-09-21")).toBe(1);
  });

  it("rounds a partial week up", () => {
    expect(weeksBetween("2026-09-15", "2026-09-22")).toBe(2);
  });

  it("is unaffected by daylight saving transitions", () => {
    // European clocks change on 25 Oct 2026; a UTC-anchored diff must not drift.
    expect(weeksBetween("2026-10-19", "2026-11-01")).toBe(2);
  });

  it("returns zero for an inverted or invalid range", () => {
    expect(weeksBetween("2026-12-20", "2026-09-15")).toBe(0);
    expect(weeksBetween("nonsense", "2026-09-15")).toBe(0);
  });
});
