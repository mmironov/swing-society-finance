import { describe, expect, it } from "vitest";

import { PlanningInputError } from "./costs";
import { forecastOffering, forecastSeason, type OfferingPlanInput } from "./forecast";
import type { SubscriptionProduct } from "./revenue";

const PRODUCTS: SubscriptionProduct[] = [
  { id: 1, name: "1 class/week — 1 month", priceCents: 4000 },
  { id: 2, name: "1 class/week — 2 months", priceCents: 6000 },
  { id: 7, name: "Single class", priceCents: 2000 },
];

/**
 * Reproduces the spec's Beginners course end to end:
 * €3,000 revenue, €1,400 teachers, €560 studio.
 */
const BEGINNERS: OfferingPlanInput = {
  offeringId: 1,
  courseName: "Swing Dance for Beginners",
  classesPerWeek: 1,
  weeks: 14,
  capacity: 30,
  expectedStudents: 25,
  expectedSales: [
    { productId: 1, quantity: 30 }, // €1,200
    { productId: 2, quantity: 25 }, // €1,500
    { productId: 7, quantity: 15 }, // €300
  ],
  teacherAssignments: [
    { teacherId: 1, classes: 14, ratePerClassCents: 5000 },
    { teacherId: 2, classes: 14, ratePerClassCents: 5000 },
  ],
  studio: { minutesPerClass: 120, hourlyRateCents: 2000 },
};

describe("forecastOffering", () => {
  it("composes revenue, costs, contribution and break-even consistently", () => {
    const result = forecastOffering(BEGINNERS, PRODUCTS);

    expect(result.classes).toBe(14);
    expect(result.revenue.totalCents).toBe(300_000);
    expect(result.contribution.teacherCostCents).toBe(140_000);
    expect(result.contribution.studioCostCents).toBe(56_000);
    expect(result.contribution.contributionProfitCents).toBe(104_000);
    expect(result.contribution.contributionMargin).toBeCloseTo(0.3467, 4);
    expect(result.breakEven.breakEvenStudents).toBe(17);
    expect(result.breakEven.safetyMarginStudents).toBe(8);
    expect(result.capacityUtilisation).toBeCloseTo(0.8333, 4);
  });

  it("treats a missing studio booking as zero studio cost, not an error", () => {
    const result = forecastOffering({ ...BEGINNERS, studio: null }, PRODUCTS);
    expect(result.contribution.studioCostCents).toBe(0);
    expect(result.contribution.contributionProfitCents).toBe(160_000);
  });

  it("handles an entirely empty plan without dividing by zero", () => {
    const result = forecastOffering(
      {
        ...BEGINNERS,
        weeks: 0,
        capacity: 0,
        expectedStudents: 0,
        expectedSales: [],
        teacherAssignments: [],
        studio: null,
      },
      PRODUCTS,
    );

    expect(result.revenue.totalCents).toBe(0);
    expect(result.contribution.contributionProfitCents).toBe(0);
    expect(result.contribution.contributionMargin).toBeNull();
    expect(result.capacityUtilisation).toBeNull();
    expect(result.breakEven.status).toBe("NO_COSTS");
  });

  it("rejects negative capacity and negative expected students", () => {
    expect(() => forecastOffering({ ...BEGINNERS, capacity: -1 }, PRODUCTS)).toThrow(PlanningInputError);
    expect(() => forecastOffering({ ...BEGINNERS, expectedStudents: -5 }, PRODUCTS)).toThrow(
      PlanningInputError,
    );
  });
});

describe("forecastSeason", () => {
  const offeringA = forecastOffering(BEGINNERS, PRODUCTS);
  const offeringB = forecastOffering(
    {
      ...BEGINNERS,
      offeringId: 2,
      courseName: "Lindy Hop — Intermediate",
      expectedStudents: 20,
      expectedSales: [{ productId: 2, quantity: 25 }], // €1,500
      teacherAssignments: [{ teacherId: 1, classes: 14, ratePerClassCents: 5000 }],
    },
    PRODUCTS,
  );

  it("sums course revenue and direct costs across offerings", () => {
    const season = forecastSeason([offeringA, offeringB]);

    expect(season.courseRevenueCents).toBe(450_000); // 3,000 + 1,500
    expect(season.courseTeacherCostCents).toBe(210_000); // 1,400 + 700
    expect(season.courseStudioCostCents).toBe(112_000); // 560 + 560
    expect(season.courseContributionProfitCents).toBe(128_000);
    expect(season.courseContributionMargin).toBeCloseTo(0.2844, 4);
  });

  it("adds manual lines for activities the course planner does not cover", () => {
    const season = forecastSeason([offeringA], [
      { categoryCode: "PARTIES", categoryName: "Parties", type: "INCOME", amountCents: 80_000 },
      { categoryCode: "MARKETING", categoryName: "Marketing", type: "EXPENSE", amountCents: 120_000 },
      {
        categoryCode: "ADMINISTRATION",
        categoryName: "Administration",
        type: "EXPENSE",
        amountCents: 50_000,
      },
    ]);

    expect(season.revenueByCategory).toEqual({ COURSE_FEES: 300_000, PARTIES: 80_000 });
    expect(season.expenseByCategory).toEqual({
      TEACHERS: 140_000,
      STUDIO_RENT: 56_000,
      MARKETING: 120_000,
      ADMINISTRATION: 50_000,
    });
    expect(season.totalRevenueCents).toBe(380_000);
    expect(season.totalExpenseCents).toBe(366_000);
    expect(season.netProfitCents).toBe(14_000);
    expect(season.profitMargin).toBeCloseTo(0.0368, 4);
    // Overhead excludes teacher and studio costs, which are course-direct.
    expect(season.overheadCents).toBe(170_000);
  });

  it("refuses a manual line that would double-count a planner-derived category", () => {
    expect(() =>
      forecastSeason([offeringA], [
        { categoryCode: "COURSE_FEES", categoryName: "Course fees", type: "INCOME", amountCents: 1000 },
      ]),
    ).toThrow(PlanningInputError);

    expect(() =>
      forecastSeason([offeringA], [
        { categoryCode: "TEACHERS", categoryName: "Teachers", type: "EXPENSE", amountCents: 1000 },
      ]),
    ).toThrow(PlanningInputError);
  });

  it("rejects negative manual forecast lines", () => {
    expect(() =>
      forecastSeason([], [
        { categoryCode: "MARKETING", categoryName: "Marketing", type: "EXPENSE", amountCents: -1 },
      ]),
    ).toThrow(PlanningInputError);
  });

  it("produces an empty but valid forecast for a season with nothing planned", () => {
    const season = forecastSeason([]);
    expect(season.totalRevenueCents).toBe(0);
    expect(season.totalExpenseCents).toBe(0);
    expect(season.netProfitCents).toBe(0);
    expect(season.profitMargin).toBeNull();
    expect(season.courseContributionMargin).toBeNull();
  });

  it("accumulates several manual lines in the same category", () => {
    const season = forecastSeason([], [
      { categoryCode: "MARKETING", categoryName: "Marketing", type: "EXPENSE", amountCents: 30_000 },
      { categoryCode: "MARKETING", categoryName: "Marketing", type: "EXPENSE", amountCents: 20_000 },
    ]);
    expect(season.expenseByCategory.MARKETING).toBe(50_000);
  });
});

describe("shared-intake offerings", () => {
  /**
   * Intermediate: students buy a subscription from the school and choose what
   * to attend, so this course has no expected sales of its own. Its revenue is
   * the slice of the season pool the operator assigned to it.
   */
  const INTERMEDIATE: OfferingPlanInput = {
    offeringId: 2,
    courseName: "Lindy Hop — Intermediate",
    classesPerWeek: 1,
    weeks: 14,
    capacity: 25,
    expectedStudents: 20,
    expectedSales: [],
    teacherAssignments: [{ teacherId: 1, classes: 14, ratePerClassCents: 5000 }],
    studio: { minutesPerClass: 120, hourlyRateCents: 2000 },
    intakeMode: "SHARED",
    poolShareBp: 4000,
    allocatedPoolCents: 240_000,
  };

  it("takes its revenue from the allocated pool slice", () => {
    const result = forecastOffering(INTERMEDIATE, PRODUCTS);

    expect(result.revenue.totalCents).toBe(240_000);
    expect(result.intakeMode).toBe("SHARED");
    expect(result.poolShareBp).toBe(4000);
    // No per-product breakdown here — those sales belong to the season plan.
    expect(result.revenue.lines).toEqual([]);
  });

  it("still computes costs, contribution and break-even normally", () => {
    const result = forecastOffering(INTERMEDIATE, PRODUCTS);

    expect(result.contribution.teacherCostCents).toBe(70_000);
    expect(result.contribution.studioCostCents).toBe(56_000);
    expect(result.contribution.contributionProfitCents).toBe(114_000);
    expect(result.breakEven.breakEvenStudents).toBeGreaterThan(0);
  });

  it("ignores any expected sales left on a shared offering", () => {
    // Switching a course from dedicated to shared must not double-count: its
    // old per-offering sales rows are no longer its revenue.
    const withStaleSales = { ...INTERMEDIATE, expectedSales: [{ productId: 1, quantity: 99 }] };

    expect(forecastOffering(withStaleSales, PRODUCTS).revenue.totalCents).toBe(240_000);
  });

  it("treats a missing allocation as zero rather than throwing", () => {
    const unallocated = { ...INTERMEDIATE, allocatedPoolCents: undefined };

    expect(forecastOffering(unallocated, PRODUCTS).revenue.totalCents).toBe(0);
  });

  it("leaves poolShareBp null on a dedicated offering", () => {
    expect(forecastOffering(BEGINNERS, PRODUCTS).poolShareBp).toBeNull();
    expect(forecastOffering(BEGINNERS, PRODUCTS).intakeMode).toBe("DEDICATED");
  });
});

describe("forecastSeason with an incompletely allocated pool", () => {
  const shared = (id: number, allocatedPoolCents: number) =>
    forecastOffering(
      {
        offeringId: id,
        courseName: `Course ${id}`,
        classesPerWeek: 1,
        weeks: 10,
        capacity: 20,
        expectedStudents: 10,
        expectedSales: [],
        teacherAssignments: [],
        studio: null,
        intakeMode: "SHARED",
        allocatedPoolCents,
        poolShareBp: 4000,
      },
      PRODUCTS,
    );

  it("counts unclaimed pool revenue in the season total", () => {
    // Shares total 80%: €800 allocated, €200 left over on a €1,000 pool.
    const result = forecastSeason([shared(1, 40_000), shared(2, 40_000)], [], {
      unallocatedPoolCents: 20_000,
    });

    // The season expects €1,000 regardless of the operator finishing the split.
    expect(result.revenueByCategory.COURSE_FEES).toBe(100_000);
    expect(result.totalRevenueCents).toBe(100_000);
    expect(result.unallocatedPoolCents).toBe(20_000);
  });

  it("keeps unclaimed revenue out of course contribution", () => {
    const result = forecastSeason([shared(1, 40_000), shared(2, 40_000)], [], {
      unallocatedPoolCents: 20_000,
    });

    // Contribution reflects only what courses actually claimed — otherwise a
    // course would appear more profitable because of money it was not assigned.
    expect(result.courseRevenueCents).toBe(80_000);
    expect(result.courseContributionProfitCents).toBe(80_000);
  });

  it("is unchanged when the pool is fully allocated", () => {
    const result = forecastSeason([shared(1, 50_000), shared(2, 50_000)], []);

    expect(result.unallocatedPoolCents).toBe(0);
    expect(result.revenueByCategory.COURSE_FEES).toBe(result.courseRevenueCents);
  });

  it("rejects a negative unallocated amount", () => {
    expect(() => forecastSeason([], [], { unallocatedPoolCents: -1 })).toThrow(PlanningInputError);
  });
});
