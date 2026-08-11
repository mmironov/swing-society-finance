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

  const revenue = expectedRevenue(input.expectedSales, products);
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
): SeasonForecast {
  const courseRevenueCents = sumCents(offerings.map((o) => o.revenue.totalCents));
  const courseTeacherCostCents = sumCents(offerings.map((o) => o.contribution.teacherCostCents));
  const courseStudioCostCents = sumCents(offerings.map((o) => o.contribution.studioCostCents));
  const courseDirectCostCents = courseTeacherCostCents + courseStudioCostCents;
  const courseContributionProfitCents = courseRevenueCents - courseDirectCostCents;

  const revenueByCategory: Record<string, Cents> = {};
  const expenseByCategory: Record<string, Cents> = {};

  if (courseRevenueCents !== 0) revenueByCategory.COURSE_FEES = courseRevenueCents;
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
    revenueByCategory,
    expenseByCategory,
    totalRevenueCents,
    totalExpenseCents,
    netProfitCents,
    profitMargin: ratio(netProfitCents, totalRevenueCents),
  };
}
