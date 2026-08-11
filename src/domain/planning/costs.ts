/**
 * Direct cost calculations for a course offering.
 *
 * "Direct" means costs caused by running this specific course. General
 * marketing and administration are deliberately NOT allocated here (spec §14):
 * they stay as overhead at season level, so the contribution margin of a course
 * is not distorted by an arbitrary allocation key.
 */

import { assertCents, type Cents, multiplyCents, scaleCents, sumCents } from "../money";

export class PlanningInputError extends Error {}

function assertNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PlanningInputError(`${label} must be a non-negative whole number, got ${value}`);
  }
  return value;
}

/**
 * Total number of class sessions an offering runs.
 *
 *   classes = classesPerWeek × weeks
 */
export function totalClasses(input: { classesPerWeek: number; weeks: number }): number {
  assertNonNegativeInteger(input.classesPerWeek, "classesPerWeek");
  assertNonNegativeInteger(input.weeks, "weeks");
  return input.classesPerWeek * input.weeks;
}

/** One teacher's engagement on an offering. */
export interface TeacherAssignment {
  teacherId: number;
  /** Number of class sessions this teacher is paid for. */
  classes: number;
  ratePerClassCents: Cents;
}

/**
 * Teacher cost.
 *
 * The spec states the formula as
 *   classes × number of teachers × rate per class
 * which only holds when every teacher is paid the same rate. Since §11 requires
 * per-teacher rates, we generalise to one assignment row per teacher:
 *   cost = Σ(assignment.classes × assignment.ratePerClassCents)
 * Two teachers at the same rate for the same classes reproduce the original
 * formula exactly.
 */
export function teacherCost(assignments: readonly TeacherAssignment[]): Cents {
  return sumCents(
    assignments.map((assignment) => {
      assertNonNegativeInteger(assignment.classes, "teacher assignment classes");
      assertCents(assignment.ratePerClassCents, "ratePerClassCents");
      if (assignment.ratePerClassCents < 0) {
        throw new PlanningInputError("ratePerClassCents must not be negative");
      }
      return multiplyCents(assignment.ratePerClassCents, assignment.classes);
    }),
  );
}

export interface StudioCostInput {
  /**
   * Length of one class in minutes. Stored as integer minutes rather than
   * fractional hours so no float ever reaches the database.
   */
  minutesPerClass: number;
  hourlyRateCents: Cents;
  classesPerWeek: number;
  weeks: number;
}

/**
 * Studio cost.
 *
 *   cost = classes × hoursPerClass × hourlyRate
 *
 * Hours per class can legitimately be fractional (a 90 minute class is 1.5h),
 * so this is the one calculation that must round. It rounds once, at the end,
 * on the total — never per class.
 */
export function studioCost(input: StudioCostInput): Cents {
  assertNonNegativeInteger(input.minutesPerClass, "minutesPerClass");
  assertCents(input.hourlyRateCents, "hourlyRateCents");
  if (input.hourlyRateCents < 0) {
    throw new PlanningInputError("hourlyRateCents must not be negative");
  }
  const classes = totalClasses(input);
  const totalHours = (classes * input.minutesPerClass) / 60;
  return scaleCents(input.hourlyRateCents, totalHours);
}

/** Convenience for UI display: 90 minutes reads as 1.5 hours. */
export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}
