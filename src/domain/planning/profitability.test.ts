import { describe, expect, it } from "vitest";

import { breakEven, capacityUtilisation, contribution } from "./profitability";

describe("contribution", () => {
  it("matches the spec §14 Beginners example", () => {
    const result = contribution({
      revenueCents: 300_000, // €3,000
      teacherCostCents: 140_000, // €1,400
      studioCostCents: 56_000, // €560
    });

    expect(result.directCostCents).toBe(196_000);
    expect(result.contributionProfitCents).toBe(104_000); // €1,040
    expect(result.contributionMargin).toBeCloseTo(0.3467, 4); // 34.7%
  });

  it("reports a negative profit when direct costs exceed revenue", () => {
    const result = contribution({
      revenueCents: 100_000,
      teacherCostCents: 140_000,
      studioCostCents: 56_000,
    });
    expect(result.contributionProfitCents).toBe(-96_000);
    expect(result.contributionMargin).toBeCloseTo(-0.96, 4);
  });

  it("returns a null margin instead of NaN when revenue is zero", () => {
    const result = contribution({
      revenueCents: 0,
      teacherCostCents: 140_000,
      studioCostCents: 0,
    });
    expect(result.contributionProfitCents).toBe(-140_000);
    expect(result.contributionMargin).toBeNull();
  });

  it("is a 100% margin when there are no costs", () => {
    const result = contribution({ revenueCents: 300_000, teacherCostCents: 0, studioCostCents: 0 });
    expect(result.contributionProfitCents).toBe(300_000);
    expect(result.contributionMargin).toBe(1);
  });
});

describe("capacityUtilisation", () => {
  it("divides expected students by capacity", () => {
    expect(capacityUtilisation(25, 30)).toBeCloseTo(0.8333, 4);
  });

  it("returns null when capacity is zero", () => {
    expect(capacityUtilisation(10, 0)).toBeNull();
  });

  it("can exceed 100% when a course is overbooked, rather than clamping", () => {
    expect(capacityUtilisation(35, 30)).toBeCloseTo(1.1667, 4);
  });
});

describe("breakEven", () => {
  it("matches the spec §15 example: 25 expected, 17 break-even, +8 margin", () => {
    // Revenue €3,000 over 25 students = €120/student; costs €1,960.
    const result = breakEven({
      revenueCents: 300_000,
      directCostCents: 196_000,
      expectedStudents: 25,
    });

    expect(result.status).toBe("OK");
    expect(result.averageRevenuePerStudentCents).toBe(12_000);
    expect(result.breakEvenStudents).toBe(17); // 16.33 rounded UP
    expect(result.safetyMarginStudents).toBe(8);
  });

  it("always rounds up — a fractional student cannot pay", () => {
    // €100 of cost at €99/student is 1.01 students.
    const result = breakEven({ revenueCents: 9900, directCostCents: 10_000, expectedStudents: 1 });
    expect(result.breakEvenStudents).toBe(2);
  });

  it("does not round up an exact result", () => {
    // €200 of cost at €100/student is exactly 2 students.
    const result = breakEven({ revenueCents: 20_000, directCostCents: 20_000, expectedStudents: 2 });
    expect(result.breakEvenStudents).toBe(2);
    expect(result.safetyMarginStudents).toBe(0);
  });

  it("needs zero students when there are no direct costs", () => {
    const result = breakEven({ revenueCents: 300_000, directCostCents: 0, expectedStudents: 25 });
    expect(result.status).toBe("NO_COSTS");
    expect(result.breakEvenStudents).toBe(0);
    expect(result.safetyMarginStudents).toBe(25);
  });

  it("is not computable with no expected students to derive a per-student price from", () => {
    const result = breakEven({ revenueCents: 300_000, directCostCents: 196_000, expectedStudents: 0 });
    expect(result.status).toBe("NOT_COMPUTABLE");
    expect(result.breakEvenStudents).toBeNull();
    expect(result.safetyMarginStudents).toBeNull();
  });

  it("is not computable when costs exist but no revenue does", () => {
    const result = breakEven({ revenueCents: 0, directCostCents: 196_000, expectedStudents: 25 });
    expect(result.status).toBe("NOT_COMPUTABLE");
    expect(result.breakEvenStudents).toBeNull();
  });

  it("reports a negative safety margin when the plan does not reach break-even", () => {
    // €120/student, €3,600 of cost → 30 students needed, only 25 expected.
    const result = breakEven({
      revenueCents: 300_000,
      directCostCents: 360_000,
      expectedStudents: 25,
    });
    expect(result.breakEvenStudents).toBe(30);
    expect(result.safetyMarginStudents).toBe(-5);
  });
});
