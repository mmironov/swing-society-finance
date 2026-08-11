import { describe, expect, it } from "vitest";

import { MoneyError } from "../money";
import {
  hoursToMinutes,
  minutesToHours,
  PlanningInputError,
  studioCost,
  teacherCost,
  totalClasses,
} from "./costs";

describe("totalClasses", () => {
  it("multiplies classes per week by weeks", () => {
    expect(totalClasses({ classesPerWeek: 1, weeks: 14 })).toBe(14);
    expect(totalClasses({ classesPerWeek: 2, weeks: 14 })).toBe(28);
  });

  it("is zero when the course runs for zero weeks", () => {
    expect(totalClasses({ classesPerWeek: 2, weeks: 0 })).toBe(0);
  });

  it("rejects negative or fractional inputs", () => {
    expect(() => totalClasses({ classesPerWeek: -1, weeks: 10 })).toThrow(PlanningInputError);
    expect(() => totalClasses({ classesPerWeek: 1.5, weeks: 10 })).toThrow(PlanningInputError);
  });
});

describe("teacherCost", () => {
  it("matches the spec example: 14 classes, 2 teachers, €50/class = €1,400", () => {
    const cost = teacherCost([
      { teacherId: 1, classes: 14, ratePerClassCents: 5000 },
      { teacherId: 2, classes: 14, ratePerClassCents: 5000 },
    ]);
    expect(cost).toBe(140_000);
  });

  it("supports different rates per teacher", () => {
    const cost = teacherCost([
      { teacherId: 1, classes: 10, ratePerClassCents: 6000 },
      { teacherId: 2, classes: 10, ratePerClassCents: 4000 },
    ]);
    expect(cost).toBe(100_000);
  });

  it("is zero with no teachers assigned", () => {
    expect(teacherCost([])).toBe(0);
  });

  it("is zero when a teacher is assigned zero classes", () => {
    expect(teacherCost([{ teacherId: 1, classes: 0, ratePerClassCents: 5000 }])).toBe(0);
  });

  it("rejects negative rates and negative class counts", () => {
    expect(() => teacherCost([{ teacherId: 1, classes: 10, ratePerClassCents: -1 }])).toThrow(
      PlanningInputError,
    );
    expect(() => teacherCost([{ teacherId: 1, classes: -1, ratePerClassCents: 100 }])).toThrow(
      PlanningInputError,
    );
  });

  it("rejects a fractional rate, which would mean a euro value leaked in", () => {
    expect(() => teacherCost([{ teacherId: 1, classes: 10, ratePerClassCents: 50.5 }])).toThrow(
      MoneyError,
    );
  });
});

describe("studioCost", () => {
  it("matches the spec example: 14 classes × 2h × €20/h = €560", () => {
    expect(
      studioCost({ minutesPerClass: 120, hourlyRateCents: 2000, classesPerWeek: 1, weeks: 14 }),
    ).toBe(56_000);
  });

  it("handles a fractional class length (90 minutes = 1.5h)", () => {
    // 10 classes × 1.5h × €20 = €300
    expect(
      studioCost({ minutesPerClass: 90, hourlyRateCents: 2000, classesPerWeek: 1, weeks: 10 }),
    ).toBe(30_000);
  });

  it("rounds only once, on the total, not per class", () => {
    // 3 classes × (50/60)h × €10.01 = 2.5 × 1001 = 2502.5 cents → 2503.
    // Rounding each class first would give 3 × 834 = 2502.
    expect(
      studioCost({ minutesPerClass: 50, hourlyRateCents: 1001, classesPerWeek: 3, weeks: 1 }),
    ).toBe(2503);
  });

  it("is zero for zero weeks, zero classes or a zero rate", () => {
    expect(studioCost({ minutesPerClass: 120, hourlyRateCents: 2000, classesPerWeek: 1, weeks: 0 })).toBe(0);
    expect(studioCost({ minutesPerClass: 120, hourlyRateCents: 2000, classesPerWeek: 0, weeks: 14 })).toBe(0);
    expect(studioCost({ minutesPerClass: 120, hourlyRateCents: 0, classesPerWeek: 1, weeks: 14 })).toBe(0);
  });

  it("rejects negative rates and negative durations", () => {
    expect(() =>
      studioCost({ minutesPerClass: 120, hourlyRateCents: -100, classesPerWeek: 1, weeks: 14 }),
    ).toThrow(PlanningInputError);
    expect(() =>
      studioCost({ minutesPerClass: -30, hourlyRateCents: 2000, classesPerWeek: 1, weeks: 14 }),
    ).toThrow(PlanningInputError);
  });

  it("stays exact for a large booking", () => {
    // 500 classes × 3h × €100 = €150,000
    expect(
      studioCost({ minutesPerClass: 180, hourlyRateCents: 10_000, classesPerWeek: 10, weeks: 50 }),
    ).toBe(15_000_000);
  });
});

describe("hour/minute helpers", () => {
  it("round-trips display hours to stored minutes", () => {
    expect(hoursToMinutes(1.5)).toBe(90);
    expect(minutesToHours(90)).toBe(1.5);
  });
});
