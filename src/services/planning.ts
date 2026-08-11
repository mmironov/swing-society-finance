/**
 * Course offerings and the season plan (MVP 2).
 *
 * This module's job is to load rows and hand them to the pure functions in
 * `@/domain/planning` — it contains no formulas of its own.
 */

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  categories,
  type CourseOffering,
  courseOfferings,
  courses,
  offeringExpectedSales,
  seasonExpectedSales,
  offeringTeacherCosts,
  seasonForecastLines,
  type SubscriptionProductRow,
  subscriptionProducts,
  teachers,
} from "@/db/schema";
import { isPlannerDerivedCategory } from "@/domain/categories";
import {
  forecastOffering,
  forecastSeason,
  type ManualForecastLine,
  type OfferingForecast,
  type OfferingPlanInput,
  type SeasonForecast,
} from "@/domain/planning/forecast";
import type { SubscriptionProduct } from "@/domain/planning/revenue";
import {
  allocatePool,
  poolRevenue,
  type PoolAllocation,
  type PoolRevenue,
} from "@/domain/planning/pool";

import { listSubscriptionProducts } from "./catalog";

export interface OfferingSummary extends CourseOffering {
  courseName: string;
}

export function listOfferings(seasonId: number): OfferingSummary[] {
  return db
    .select({
      id: courseOfferings.id,
      courseId: courseOfferings.courseId,
      seasonId: courseOfferings.seasonId,
      startDate: courseOfferings.startDate,
      endDate: courseOfferings.endDate,
      classesPerWeek: courseOfferings.classesPerWeek,
      weeks: courseOfferings.weeks,
      capacity: courseOfferings.capacity,
      expectedStudents: courseOfferings.expectedStudents,
      minutesPerClass: courseOfferings.minutesPerClass,
      studioHourlyRateCents: courseOfferings.studioHourlyRateCents,
      intakeMode: courseOfferings.intakeMode,
      poolShareBp: courseOfferings.poolShareBp,
      status: courseOfferings.status,
      createdAt: courseOfferings.createdAt,
      courseName: courses.name,
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .where(eq(courseOfferings.seasonId, seasonId))
    .orderBy(asc(courses.sortOrder), asc(courses.name))
    .all();
}

export function getOffering(id: number): OfferingSummary | undefined {
  return db
    .select({
      id: courseOfferings.id,
      courseId: courseOfferings.courseId,
      seasonId: courseOfferings.seasonId,
      startDate: courseOfferings.startDate,
      endDate: courseOfferings.endDate,
      classesPerWeek: courseOfferings.classesPerWeek,
      weeks: courseOfferings.weeks,
      capacity: courseOfferings.capacity,
      expectedStudents: courseOfferings.expectedStudents,
      minutesPerClass: courseOfferings.minutesPerClass,
      studioHourlyRateCents: courseOfferings.studioHourlyRateCents,
      intakeMode: courseOfferings.intakeMode,
      poolShareBp: courseOfferings.poolShareBp,
      status: courseOfferings.status,
      createdAt: courseOfferings.createdAt,
      courseName: courses.name,
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .where(eq(courseOfferings.id, id))
    .get();
}

export interface OfferingInput {
  courseId: number;
  seasonId: number;
  startDate: string;
  endDate: string;
  classesPerWeek: number;
  weeks: number;
  capacity: number;
  expectedStudents: number;
  minutesPerClass: number;
  studioHourlyRateCents: number | null;
  status: CourseOffering["status"];
  intakeMode: CourseOffering["intakeMode"];
  /** Share of the season pool, in basis points. Only meaningful when SHARED. */
  poolShareBp: number;
}

export function createOffering(input: OfferingInput): CourseOffering {
  assertValidOffering(input);
  return db.insert(courseOfferings).values(input).returning().get();
}

export function updateOffering(id: number, input: Partial<OfferingInput>): CourseOffering {
  const existing = db.select().from(courseOfferings).where(eq(courseOfferings.id, id)).get();
  if (!existing) throw new Error("Course offering not found");
  const merged = { ...existing, ...input };
  assertValidOffering(merged);
  assertSeasonSharesFit(merged.seasonId, id, merged.intakeMode, merged.poolShareBp);
  return db.update(courseOfferings).set(input).where(eq(courseOfferings.id, id)).returning().get();
}

/**
 * Courses in one season cannot claim more of the shared pool than exists.
 *
 * This is a cross-row rule, so no database constraint can express it and the
 * write path has to. Without it a save is accepted and the season planner then
 * fails to render, because allocating more than 100% is rejected downstream —
 * the operator would see a broken page rather than a message about percentages.
 */
function assertSeasonSharesFit(
  seasonId: number,
  offeringId: number,
  intakeMode: CourseOffering["intakeMode"],
  poolShareBp: number,
): void {
  if (intakeMode !== "SHARED") return;

  const others = db
    .select({ id: courseOfferings.id, poolShareBp: courseOfferings.poolShareBp })
    .from(courseOfferings)
    .where(and(eq(courseOfferings.seasonId, seasonId), eq(courseOfferings.intakeMode, "SHARED")))
    .all()
    .filter((offering) => offering.id !== offeringId)
    .reduce((sum, offering) => sum + offering.poolShareBp, 0);

  const total = others + poolShareBp;
  if (total > 10_000) {
    throw new Error(
      `Courses in this season would claim ${(total / 100).toFixed(2)}% of the shared pool. ` +
        `The other courses already take ${(others / 100).toFixed(2)}%, so this one can take at most ` +
        `${((10_000 - others) / 100).toFixed(2)}%.`,
    );
  }
}

export function deleteOffering(id: number): void {
  db.delete(courseOfferings).where(eq(courseOfferings.id, id)).run();
}

function assertValidOffering(
  input: Omit<OfferingInput, "status" | "intakeMode" | "poolShareBp"> & {
    status?: string;
    intakeMode?: string;
    poolShareBp?: number;
  },
) {
  if (input.endDate < input.startDate) throw new Error("End date must not be before the start date");
  // The database no longer carries this constraint — adding a CHECK to an
  // existing SQLite table forces a rebuild that cascade-deletes course plans.
  // See the comment on course_offerings.pool_share_bp in schema.ts.
  if (input.poolShareBp !== undefined) {
    if (!Number.isInteger(input.poolShareBp) || input.poolShareBp < 0 || input.poolShareBp > 10_000) {
      throw new Error("Pool share must be between 0% and 100%");
    }
  }
  for (const [label, value] of [
    ["Classes per week", input.classesPerWeek],
    ["Weeks", input.weeks],
    ["Capacity", input.capacity],
    ["Expected students", input.expectedStudents],
    ["Class length", input.minutesPerClass],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must not be negative`);
  }
  if (input.studioHourlyRateCents !== null && input.studioHourlyRateCents < 0) {
    throw new Error("Studio rate must not be negative");
  }
}

/* --------------------------------------------------------- plan assumptions */

export interface ExpectedSaleRow {
  productId: number;
  quantity: number;
}

export interface TeacherCostRow {
  teacherId: number;
  teacherName: string;
  classes: number;
  ratePerClassCents: number;
}

export interface OfferingPlan {
  offering: OfferingSummary;
  expectedSales: ExpectedSaleRow[];
  teacherCosts: TeacherCostRow[];
}

export function getOfferingPlan(offeringId: number): OfferingPlan | undefined {
  const offering = getOffering(offeringId);
  if (!offering) return undefined;

  const expectedSales = db
    .select({
      productId: offeringExpectedSales.productId,
      quantity: offeringExpectedSales.quantity,
    })
    .from(offeringExpectedSales)
    .where(eq(offeringExpectedSales.offeringId, offeringId))
    .all();

  const teacherCosts = db
    .select({
      teacherId: offeringTeacherCosts.teacherId,
      teacherName: teachers.name,
      classes: offeringTeacherCosts.classes,
      ratePerClassCents: offeringTeacherCosts.ratePerClassCents,
    })
    .from(offeringTeacherCosts)
    .innerJoin(teachers, eq(offeringTeacherCosts.teacherId, teachers.id))
    .where(eq(offeringTeacherCosts.offeringId, offeringId))
    .all();

  return { offering, expectedSales, teacherCosts };
}

/** Replaces the whole expected-sales mix for an offering in one transaction. */
export function saveExpectedSales(offeringId: number, sales: readonly ExpectedSaleRow[]): void {
  db.transaction((tx) => {
    tx.delete(offeringExpectedSales).where(eq(offeringExpectedSales.offeringId, offeringId)).run();
    const rows = sales.filter((sale) => sale.quantity > 0);
    if (rows.length) {
      tx.insert(offeringExpectedSales)
        .values(rows.map((sale) => ({ offeringId, ...sale })))
        .run();
    }
  });
}

export function saveTeacherCosts(
  offeringId: number,
  assignments: readonly { teacherId: number; classes: number; ratePerClassCents: number }[],
): void {
  db.transaction((tx) => {
    tx.delete(offeringTeacherCosts).where(eq(offeringTeacherCosts.offeringId, offeringId)).run();
    // De-duplicate by teacher: the unique index would otherwise reject the batch.
    const byTeacher = new Map(assignments.map((a) => [a.teacherId, a]));
    const rows = [...byTeacher.values()].filter((a) => a.classes > 0 || a.ratePerClassCents > 0);
    if (rows.length) {
      tx.insert(offeringTeacherCosts)
        .values(rows.map((assignment) => ({ offeringId, ...assignment })))
        .run();
    }
  });
}

/* ----------------------------------------------------------------- forecast */

export function toDomainProducts(rows: SubscriptionProductRow[]): SubscriptionProduct[] {
  return rows.map((row) => ({ id: row.id, name: row.name, priceCents: row.priceCents }));
}

function toPlanInput(plan: OfferingPlan, allocatedPoolCents = 0): OfferingPlanInput {
  return {
    offeringId: plan.offering.id,
    intakeMode: plan.offering.intakeMode,
    poolShareBp: plan.offering.poolShareBp,
    allocatedPoolCents,
    courseName: plan.offering.courseName,
    classesPerWeek: plan.offering.classesPerWeek,
    weeks: plan.offering.weeks,
    capacity: plan.offering.capacity,
    expectedStudents: plan.offering.expectedStudents,
    expectedSales: plan.expectedSales,
    teacherAssignments: plan.teacherCosts,
    studio:
      plan.offering.studioHourlyRateCents === null
        ? null
        : {
            minutesPerClass: plan.offering.minutesPerClass,
            hourlyRateCents: plan.offering.studioHourlyRateCents,
          },
  };
}

/* ------------------------------------------------- season subscription pool */

export interface SeasonSaleRow {
  productId: number;
  month: string;
  quantity: number;
}

export function getSeasonExpectedSales(seasonId: number): SeasonSaleRow[] {
  return db
    .select({
      productId: seasonExpectedSales.productId,
      month: seasonExpectedSales.month,
      quantity: seasonExpectedSales.quantity,
    })
    .from(seasonExpectedSales)
    .where(eq(seasonExpectedSales.seasonId, seasonId))
    .orderBy(asc(seasonExpectedSales.month), asc(seasonExpectedSales.productId))
    .all();
}

/** Replaces the whole plan for a season. Zero quantities are simply not stored. */
export function saveSeasonExpectedSales(seasonId: number, sales: readonly SeasonSaleRow[]): void {
  db.transaction((tx) => {
    tx.delete(seasonExpectedSales).where(eq(seasonExpectedSales.seasonId, seasonId)).run();
    const rows = sales.filter((sale) => sale.quantity > 0);
    if (rows.length > 0) {
      tx.insert(seasonExpectedSales)
        .values(rows.map((sale) => ({ seasonId, ...sale })))
        .run();
    }
  });
}

export interface SeasonPool extends PoolAllocation {
  revenue: PoolRevenue;
  /**
   * True when stored shares exceed 100%. The write path prevents this, but a
   * read must never throw: a page that cannot render is a worse failure than a
   * page that reports the problem.
   */
  isOverAllocated: boolean;
}

/**
 * The season's shared subscription sales, and how they divide across the
 * offerings marked SHARED. Offerings are always allocated in a stable order so
 * the leftover-cent distribution does not shift between page loads.
 */
export function getSeasonPool(seasonId: number): SeasonPool {
  const revenue = poolRevenue(
    getSeasonExpectedSales(seasonId),
    toDomainProducts(listSubscriptionProducts(true)),
  );
  const shares = listOfferings(seasonId)
    .filter((offering) => offering.intakeMode === "SHARED")
    .map((offering) => ({ offeringId: offering.id, shareBp: offering.poolShareBp }));

  const totalShareBp = shares.reduce((sum, share) => sum + share.shareBp, 0);
  if (totalShareBp > 10_000) {
    // Degrade rather than throw. Allocating nothing keeps every course's
    // contribution honest, and the whole pool is reported as unallocated so the
    // planner can show what is wrong instead of failing to load.
    return {
      revenue,
      isOverAllocated: true,
      allocations: shares.map((share) => ({ ...share, amountCents: 0 })),
      totalShareBp,
      unallocatedCents: revenue.totalCents,
      isFullyAllocated: false,
    };
  }

  return { revenue, isOverAllocated: false, ...allocatePool(revenue.totalCents, shares) };
}

export function forecastForOffering(offeringId: number): OfferingForecast | undefined {
  const plan = getOfferingPlan(offeringId);
  if (!plan) return undefined;

  // A shared offering's revenue depends on the whole season, not just itself.
  const allocated =
    plan.offering.intakeMode === "SHARED"
      ? (getSeasonPool(plan.offering.seasonId).allocations.find(
          (allocation) => allocation.offeringId === offeringId,
        )?.amountCents ?? 0)
      : 0;

  // Inactive products still need pricing: an offering may reference one.
  return forecastOffering(
    toPlanInput(plan, allocated),
    toDomainProducts(listSubscriptionProducts(true)),
  );
}

export function listManualForecastLines(seasonId: number): (ManualForecastLine & { id: number })[] {
  return db
    .select({
      id: seasonForecastLines.id,
      categoryCode: categories.code,
      categoryName: categories.name,
      type: seasonForecastLines.type,
      amountCents: seasonForecastLines.amountCents,
    })
    .from(seasonForecastLines)
    .innerJoin(categories, eq(seasonForecastLines.categoryId, categories.id))
    .where(eq(seasonForecastLines.seasonId, seasonId))
    .orderBy(asc(categories.type), asc(categories.sortOrder))
    .all();
}

/**
 * Sets (or clears) the manual forecast for one category in a season.
 * Rejects planner-derived categories, which would double-count course figures.
 */
export function saveManualForecastLine(input: {
  seasonId: number;
  categoryId: number;
  amountCents: number;
}): void {
  const category = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
  if (!category) throw new Error("Select a category");
  if (isPlannerDerivedCategory(category.code)) {
    throw new Error(
      `${category.name} is calculated from the course planner and cannot be forecast by hand`,
    );
  }
  if (input.amountCents < 0) throw new Error("Forecast amount must not be negative");

  const where = and(
    eq(seasonForecastLines.seasonId, input.seasonId),
    eq(seasonForecastLines.categoryId, input.categoryId),
  );

  if (input.amountCents === 0) {
    db.delete(seasonForecastLines).where(where).run();
    return;
  }

  db.insert(seasonForecastLines)
    .values({
      seasonId: input.seasonId,
      categoryId: input.categoryId,
      type: category.type,
      amountCents: input.amountCents,
    })
    .onConflictDoUpdate({
      target: [seasonForecastLines.seasonId, seasonForecastLines.categoryId],
      set: { amountCents: input.amountCents },
    })
    .run();
}

/** The full season forecast: every offering rolled up, plus the manual lines. */
export function forecastForSeason(seasonId: number): SeasonForecast {
  const products = toDomainProducts(listSubscriptionProducts(true));
  const pool = getSeasonPool(seasonId);
  const allocatedById = new Map(pool.allocations.map((a) => [a.offeringId, a.amountCents]));

  const offeringForecasts = listOfferings(seasonId)
    .map((offering) => getOfferingPlan(offering.id))
    .filter((plan): plan is OfferingPlan => plan !== undefined)
    .map((plan) => forecastOffering(toPlanInput(plan, allocatedById.get(plan.offering.id) ?? 0), products));

  return forecastSeason(offeringForecasts, listManualForecastLines(seasonId), {
    unallocatedPoolCents: pool.unallocatedCents,
  });
}

export function listAvailableProductsForPlanning(): SubscriptionProductRow[] {
  return db
    .select()
    .from(subscriptionProducts)
    .where(eq(subscriptionProducts.active, true))
    .orderBy(asc(subscriptionProducts.sortOrder), asc(subscriptionProducts.name))
    .all();
}
