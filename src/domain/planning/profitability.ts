/**
 * Course profitability, contribution margin and break-even.
 *
 * METHODOLOGY NOTE (spec §14, §15): these are *management* figures, not
 * accounting figures. Only direct costs (teachers, studio) are subtracted, so
 * the result is a CONTRIBUTION profit — the amount a course contributes towards
 * covering overhead such as marketing and administration. It is not net profit.
 */

import { type Cents, type Ratio, ratio } from "../money";
import { averageRevenuePerStudent } from "./revenue";

export interface ContributionInput {
  revenueCents: Cents;
  teacherCostCents: Cents;
  studioCostCents: Cents;
}

export interface Contribution {
  revenueCents: Cents;
  teacherCostCents: Cents;
  studioCostCents: Cents;
  directCostCents: Cents;
  contributionProfitCents: Cents;
  /** profit / revenue, or null when there is no revenue to divide by. */
  contributionMargin: Ratio | null;
}

export function contribution(input: ContributionInput): Contribution {
  const directCostCents = input.teacherCostCents + input.studioCostCents;
  const contributionProfitCents = input.revenueCents - directCostCents;
  return {
    revenueCents: input.revenueCents,
    teacherCostCents: input.teacherCostCents,
    studioCostCents: input.studioCostCents,
    directCostCents,
    contributionProfitCents,
    contributionMargin: ratio(contributionProfitCents, input.revenueCents),
  };
}

/** expectedStudents / capacity, or null when capacity is zero. */
export function capacityUtilisation(expectedStudents: number, capacity: number): Ratio | null {
  return ratio(expectedStudents, capacity);
}

export type BreakEvenStatus =
  /** Costs are covered with zero students — nothing to break even on. */
  | "NO_COSTS"
  /** Break-even is computable. */
  | "OK"
  /** No expected students or no revenue, so revenue per student is unknown. */
  | "NOT_COMPUTABLE";

export interface BreakEven {
  status: BreakEvenStatus;
  /** Students needed to cover direct costs, rounded UP. Null when not computable. */
  breakEvenStudents: number | null;
  /** expectedStudents − breakEvenStudents. Positive means headroom. */
  safetyMarginStudents: number | null;
  /** Fractional cents per student; exposed so the UI can explain the number. */
  averageRevenuePerStudentCents: number | null;
}

/**
 * Break-even students = total direct costs / average expected revenue per student,
 * rounded up to the next whole student.
 *
 * This uses the *planned* revenue mix to derive revenue per student. It assumes
 * additional students buy a similar mix of subscriptions to the planned ones,
 * which is a simplification and is labelled as such in the UI.
 */
export function breakEven(input: {
  revenueCents: Cents;
  directCostCents: Cents;
  expectedStudents: number;
}): BreakEven {
  const perStudent = averageRevenuePerStudent(input.revenueCents, input.expectedStudents);

  if (input.directCostCents <= 0) {
    return {
      status: "NO_COSTS",
      breakEvenStudents: 0,
      safetyMarginStudents: input.expectedStudents,
      averageRevenuePerStudentCents: perStudent,
    };
  }

  if (perStudent === null || perStudent <= 0) {
    return {
      status: "NOT_COMPUTABLE",
      breakEvenStudents: null,
      safetyMarginStudents: null,
      averageRevenuePerStudentCents: perStudent,
    };
  }

  const breakEvenStudents = Math.ceil(input.directCostCents / perStudent);
  return {
    status: "OK",
    breakEvenStudents,
    safetyMarginStudents: input.expectedStudents - breakEvenStudents,
    averageRevenuePerStudentCents: perStudent,
  };
}
