/**
 * Swing Society's REAL reference data — the courses actually taught, the
 * subscription products actually sold, and the categories money actually moves
 * through. None of this is fictional.
 *
 * This module is the single source of truth, imported by both the demo seed
 * (`seed.ts`) and the production bootstrap (`init.ts`). Keeping one copy is the
 * point: a price that changes here must not silently remain stale in the other.
 *
 * Nothing here is a transaction, a forecast or a person — those are either
 * demo fixtures or entered by the operator.
 */

import { eq } from "drizzle-orm";

import { eurosToCents } from "@/domain/money";
import { DEFAULT_CATEGORIES } from "@/domain/categories";

import { db } from "./client";
import { activities, categories, courses, subscriptionProducts } from "./schema";

export const REFERENCE_COURSES = [
  { name: "Swing Dance for Beginners", sortOrder: 10, description: "Entry-level swing course" },
  { name: "Lindy Hop — Intermediate", sortOrder: 20, description: "For dancers with a season behind them" },
  { name: "Lindy Hop — Advanced", sortOrder: 30, description: "Fast tempos and improvisation" },
  { name: "Jazz", sortOrder: 40, description: "Solo jazz technique and routines" },
] as const;

/**
 * Activities tag a transaction with what it was *for*. The four course
 * activities are linked to their course; the rest are standalone buckets that
 * become real entities in a later MVP.
 */
export const REFERENCE_ACTIVITIES = [
  { name: "Beginners", kind: "COURSE", courseName: "Swing Dance" },
  { name: "Intermediate", kind: "COURSE", courseName: "Lindy Hop — Intermediate" },
  { name: "Advanced", kind: "COURSE", courseName: "Lindy Hop — Advanced" },
  { name: "Jazz", kind: "COURSE", courseName: "Jazz" },
  { name: "Workshop", kind: "WORKSHOP", courseName: null },
  { name: "Party", kind: "PARTY", courseName: null },
  { name: "Swing Buzz", kind: "FESTIVAL", courseName: null },
  { name: "General", kind: "GENERAL", courseName: null },
] as const;

/** The seven products on the current price list. */
export const REFERENCE_SUBSCRIPTION_PRODUCTS = [
  { name: "1 class/week — 1 month", classesPerWeek: 1, durationMonths: 1, priceCents: eurosToCents(40), sortOrder: 10 },
  { name: "1 class/week — 2 months", classesPerWeek: 1, durationMonths: 2, priceCents: eurosToCents(60), sortOrder: 20 },
  { name: "2 classes/week — 1 month", classesPerWeek: 2, durationMonths: 1, priceCents: eurosToCents(60), sortOrder: 30 },
  { name: "2 classes/week — 2 months", classesPerWeek: 2, durationMonths: 2, priceCents: eurosToCents(100), sortOrder: 40 },
  { name: "Unlimited — 1 month", classesPerWeek: null, durationMonths: 1, priceCents: eurosToCents(80), isUnlimited: true, sortOrder: 50 },
  { name: "Unlimited — 2 months", classesPerWeek: null, durationMonths: 2, priceCents: eurosToCents(120), isUnlimited: true, sortOrder: 60 },
  { name: "Single class", classesPerWeek: 1, durationMonths: null, priceCents: eurosToCents(20), kind: "SINGLE_CLASS", sortOrder: 70 },
] as const;

export interface ReferenceDataReport {
  categories: number;
  courses: number;
  activities: number;
  subscriptionProducts: number;
}

/**
 * Inserts any reference rows that are missing, and leaves existing rows alone.
 *
 * IDEMPOTENT BY DESIGN — this runs on every production start, so it must be
 * safe to run against a database that is already populated and in daily use. It
 * never updates and never deletes: if an operator has renamed a category or
 * repriced a product through the UI, that is their decision and this must not
 * silently revert it.
 *
 * Must be called inside a transaction by the caller.
 */
export function ensureReferenceData(): ReferenceDataReport {
  const report: ReferenceDataReport = {
    categories: 0,
    courses: 0,
    activities: 0,
    subscriptionProducts: 0,
  };

  // Categories and the rest key off unique columns, so onConflictDoNothing is
  // enough. `.returning()` reports only the rows actually inserted.
  report.categories = db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((category) => ({ ...category, isSystem: true })))
    .onConflictDoNothing()
    .returning()
    .all().length;

  report.courses = db
    .insert(courses)
    .values(REFERENCE_COURSES.map((course) => ({ ...course })))
    .onConflictDoNothing()
    .returning()
    .all().length;

  report.subscriptionProducts = db
    .insert(subscriptionProducts)
    .values(REFERENCE_SUBSCRIPTION_PRODUCTS.map((product) => ({ ...product })))
    .onConflictDoNothing()
    .returning()
    .all().length;

  // Activity names are NOT unique in the schema (two seasons could plausibly
  // want distinct activities sharing a label), so conflict handling cannot do
  // the work here — existence has to be checked explicitly.
  const courseIdByName = new Map(
    db.select({ id: courses.id, name: courses.name }).from(courses).all().map((row) => [row.name, row.id]),
  );
  const resolveCourseId = (prefix: string | null): number | null => {
    if (prefix === null) return null;
    for (const [name, id] of courseIdByName) if (name.startsWith(prefix)) return id;
    return null;
  };

  for (const activity of REFERENCE_ACTIVITIES) {
    const exists = db.select({ id: activities.id }).from(activities).where(eq(activities.name, activity.name)).get();
    if (exists) continue;

    db.insert(activities)
      .values({
        name: activity.name,
        kind: activity.kind,
        courseId: resolveCourseId(activity.courseName),
      })
      .run();
    report.activities += 1;
  }

  return report;
}
