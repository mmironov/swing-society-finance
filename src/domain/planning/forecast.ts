/**
 * Composes a full forecast for one course offering, then rolls offerings up
 * into a season forecast (spec §13–§16).
 */

import { isPlannerDerivedCategory, type TransactionType } from "../categories";
import { type Cents, type Ratio, ratio, sumCents } from "../money";
import { PlanningInputError, studioCost, type TeacherAssignment, teacherCost, totalClasses } from "./costs";
import {
  breakEven,
  type BreakEven,
  capacityUtilisation,
  contribution,
  type Contribution,
} from "./profitability";
import { expectedRevenue, type ExpectedRevenue, type ExpectedSale, type SubscriptionProduct } from "./revenue";

export interface OfferingPlanInput {
  offeringId: number;
  courseName: string;
  classesPerWeek: number;
  weeks: number;
  capacity: number;
  expectedStudents: number;
  expectedSales: readonly ExpectedSale[];
  teacherAssignments: readonly TeacherAssignment[];
  studio: { minutesPerClass: number; hourlyRateCents: Cents } | null;
  /**
   * DEDICATED — students join for this course, so its own expected sales are
   * its revenue. SHARED — students buy from the school and choose what to
   * attend, so revenue comes from this offering's slice of the season pool.
   * Omitted means DEDICATED, which is how every offering behaved before the
   * pool existed.
   */
  intakeMode?: "DEDICATED" | "SHARED";
  /** This offering's slice of the season pool. Only read when SHARED. */
  allocatedPoolCents?: Cents;
  /** The share that produced the allocation, for display. Only read when SHARED. */
  poolShareBp?: number;
}

export interface OfferingForecast {
  offeringId: number;
  courseName: string;
  classes: number;
  capacity: number;
  expectedStudents: number;
  revenue: ExpectedRevenue;
  contribution: Contribution;
  breakEven: BreakEven;
  capacityUtilisation: Ratio | null;
  intakeMode: "DEDICATED" | "SHARED";
  /** Set only for SHARED offerings, so the UI can show where revenue came from. */
  poolShareBp: number | null;
}

/**
 * Pure — this runs unchanged on the server for reports and in the browser for
 * the live-updating course planning screen, so both always agree.
 */
export function forecastOffering(
  input: OfferingPlanInput,
  products: readonly SubscriptionProduct[],
): OfferingForecast {
  if (input.capacity < 0 || !Number.isInteger(input.capacity)) {
    throw new PlanningInputError(`capacity must be a non-negative whole number, got ${input.capacity}`);
  }
  if (input.expectedStudents < 0 || !Number.isInteger(input.expectedStudents)) {
    throw new PlanningInputError(
      `expectedStudents must be a non-negative whole number, got ${input.expectedStudents}`,
    );
  }

  const intakeMode = input.intakeMode ?? "DEDICATED";

  // A shared offering has no expected sales of its own — the sales were made at
  // the season level, and this offering's revenue is the slice allocated to it.
  // `lines` is empty because there is no per-product breakdown to show here;
  // that breakdown belongs to the season plan.
  const revenue: ExpectedRevenue =
    intakeMode === "SHARED"
      ? { lines: [], totalCents: input.allocatedPoolCents ?? 0, totalUnits: 0 }
      : expectedRevenue(input.expectedSales, products);

  const teacherCostCents = teacherCost(input.teacherAssignments);
  const studioCostCents = input.studio
    ? studioCost({
        minutesPerClass: input.studio.minutesPerClass,
        hourlyRateCents: input.studio.hourlyRateCents,
        classesPerWeek: input.classesPerWeek,
        weeks: input.weeks,
      })
    : 0;

  const contributionResult = contribution({
    revenueCents: revenue.totalCents,
    teacherCostCents,
    studioCostCents,
  });

  return {
    offeringId: input.offeringId,
    courseName: input.courseName,
    classes: totalClasses(input),
    capacity: input.capacity,
    expectedStudents: input.expectedStudents,
    revenue,
    contribution: contributionResult,
    breakEven: breakEven({
      revenueCents: revenue.totalCents,
      directCostCents: contributionResult.directCostCents,
      expectedStudents: input.expectedStudents,
    }),
    capacityUtilisation: capacityUtilisation(input.expectedStudents, input.capacity),
    intakeMode,
    poolShareBp: intakeMode === "SHARED" ? (input.poolShareBp ?? 0) : null,
  };
}

/** A forecast amount entered by hand for things the course planner does not cover. */
export interface ManualForecastLine {
  categoryCode: string;
  categoryName: string;
  type: TransactionType;
  amountCents: Cents;
}

export interface SeasonForecastTotals {
  /** Per-category totals, keyed by category code. */
  revenueByCategory: Record<string, Cents>;
  expenseByCategory: Record<string, Cents>;
  totalRevenueCents: Cents;
  totalExpenseCents: Cents;
  netProfitCents: Cents;
  profitMargin: Ratio | null;
}

export interface SeasonForecast extends SeasonForecastTotals {
  offerings: OfferingForecast[];
  /** Course-only subtotals — the contribution view from the planner. */
  courseRevenueCents: Cents;
  courseTeacherCostCents: Cents;
  courseStudioCostCents: Cents;
  courseDirectCostCents: Cents;
  courseContributionProfitCents: Cents;
  courseContributionMargin: Ratio | null;
  /** Costs not attributable to a single course (marketing, admin, …). */
  overheadCents: Cents;
  /**
   * Pool revenue no offering claimed, because the shares total under 100%.
   * Counted in season revenue but in no course's contribution — a number the
   * planner should show rather than absorb.
   */
  unallocatedPoolCents: Cents;
}

/**
 * Rolls course forecasts and manual lines into one season forecast.
 *
 * Course fees, teacher costs and studio costs are DERIVED from the offerings.
 * Passing a manual line in one of those categories is an error rather than a
 * silent addition, because it would double-count.
 */
export function forecastSeason(
  offerings: readonly OfferingForecast[],
  manualLines: readonly ManualForecastLine[] = [],
  options: { unallocatedPoolCents?: Cents } = {},
): SeasonForecast {
  const unallocatedPoolCents = options.unallocatedPoolCents ?? 0;
  if (unallocatedPoolCents < 0) {
    throw new PlanningInputError(`unallocated pool revenue must not be negative`);
  }
  const courseRevenueCents = sumCents(offerings.map((o) => o.revenue.totalCents));
  const courseTeacherCostCents = sumCents(offerings.map((o) => o.contribution.teacherCostCents));
  const courseStudioCostCents = sumCents(offerings.map((o) => o.contribution.studioCostCents));
  const courseDirectCostCents = courseTeacherCostCents + courseStudioCostCents;
  const courseContributionProfitCents = courseRevenueCents - courseDirectCostCents;

  const revenueByCategory: Record<string, Cents> = {};
  const expenseByCategory: Record<string, Cents> = {};

  // Season revenue counts the WHOLE pool, including any part no offering has
  // claimed. If shares total 97%, the missing 3% is still money the school
  // expects to receive — dropping it from the season forecast because the
  // percentages are incomplete would understate the season. It is deliberately
  // excluded from the per-course contribution figures below, since it belongs
  // to no course, and surfaced as unallocatedPoolCents so the planner can say so.
  const courseFeesCents = courseRevenueCents + unallocatedPoolCents;
  if (courseFeesCents !== 0) revenueByCategory.COURSE_FEES = courseFeesCents;
  if (courseTeacherCostCents !== 0) expenseByCategory.TEACHERS = courseTeacherCostCents;
  if (courseStudioCostCents !== 0) expenseByCategory.STUDIO_RENT = courseStudioCostCents;

  let overheadCents = 0;
  for (const line of manualLines) {
    if (isPlannerDerivedCategory(line.categoryCode)) {
      throw new PlanningInputError(
        `"${line.categoryCode}" is derived from the course planner and cannot also be forecast manually`,
      );
    }
    if (line.amountCents < 0) {
      throw new PlanningInputError(`forecast line "${line.categoryCode}" must not be negative`);
    }
    const target = line.type === "INCOME" ? revenueByCategory : expenseByCategory;
    target[line.categoryCode] = (target[line.categoryCode] ?? 0) + line.amountCents;
    if (line.type === "EXPENSE") overheadCents += line.amountCents;
  }

  const totalRevenueCents = sumCents(Object.values(revenueByCategory));
  const totalExpenseCents = sumCents(Object.values(expenseByCategory));
  const netProfitCents = totalRevenueCents - totalExpenseCents;

  return {
    offerings: [...offerings],
    courseRevenueCents,
    courseTeacherCostCents,
    courseStudioCostCents,
    courseDirectCostCents,
    courseContributionProfitCents,
    courseContributionMargin: ratio(courseContributionProfitCents, courseRevenueCents),
    overheadCents,
    unallocatedPoolCents,
    revenueByCategory,
    expenseByCategory,
    totalRevenueCents,
    totalExpenseCents,
    netProfitCents,
    profitMargin: ratio(netProfitCents, totalRevenueCents),
  };
}
