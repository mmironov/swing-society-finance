/**
 * Reference data: categories, activities, courses, subscription products and
 * teachers. These change rarely and are edited from the Settings screen.
 */

import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activities,
  type Activity,
  categories,
  type Category,
  type Course,
  courses,
  type SubscriptionProductRow,
  subscriptionProducts,
  type Teacher,
  teachers,
} from "@/db/schema";
import type { TransactionType } from "@/domain/categories";

/* -------------------------------------------------------------- categories */

export function listCategories(): Category[] {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.type), asc(categories.sortOrder), asc(categories.name))
    .all();
}

export function listCategoriesByType(type: TransactionType): Category[] {
  return listCategories().filter((category) => category.type === type && category.active);
}

export function getCategoryByCode(code: string): Category | undefined {
  return db.select().from(categories).where(eq(categories.code, code)).get();
}

export function createCategory(input: {
  code: string;
  name: string;
  type: TransactionType;
  sortOrder?: number;
}): Category {
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!code) throw new Error("Category code is required");
  if (!input.name.trim()) throw new Error("Category name is required");
  return db
    .insert(categories)
    .values({ code, name: input.name.trim(), type: input.type, sortOrder: input.sortOrder ?? 100 })
    .returning()
    .get();
}

/** Lookup maps used by the reporting layer to label rows by category code. */
export function categoryLookups() {
  const all = listCategories();
  return {
    names: Object.fromEntries(all.map((c) => [c.code, c.name])) as Record<string, string>,
    order: Object.fromEntries(all.map((c) => [c.code, c.sortOrder])) as Record<string, number>,
    byId: new Map(all.map((c) => [c.id, c])),
    byCode: new Map(all.map((c) => [c.code, c])),
  };
}

/* -------------------------------------------------------------- activities */

export function listActivities(): Activity[] {
  return db.select().from(activities).orderBy(asc(activities.name)).all();
}

/* ----------------------------------------------------------------- courses */

export function listCourses(includeInactive = false): Course[] {
  const all = db.select().from(courses).orderBy(asc(courses.sortOrder), asc(courses.name)).all();
  return includeInactive ? all : all.filter((course) => course.active);
}

export function getCourse(id: number): Course | undefined {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

export interface CourseInput {
  name: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
}

export function createCourse(input: CourseInput): Course {
  if (!input.name.trim()) throw new Error("Course name is required");
  return db
    .insert(courses)
    .values({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      sortOrder: input.sortOrder ?? 100,
      active: input.active ?? true,
    })
    .returning()
    .get();
}

export function updateCourse(id: number, input: CourseInput): Course {
  if (!input.name.trim()) throw new Error("Course name is required");
  return db
    .update(courses)
    .set({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      sortOrder: input.sortOrder ?? 100,
      active: input.active ?? true,
    })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

/* --------------------------------------------------- subscription products */

export function listSubscriptionProducts(includeInactive = false): SubscriptionProductRow[] {
  const all = db
    .select()
    .from(subscriptionProducts)
    .orderBy(asc(subscriptionProducts.sortOrder), asc(subscriptionProducts.name))
    .all();
  return includeInactive ? all : all.filter((product) => product.active);
}

export interface SubscriptionProductInput {
  name: string;
  classesPerWeek: number | null;
  durationMonths: number | null;
  priceCents: number;
  isUnlimited: boolean;
  kind: SubscriptionProductRow["kind"];
  sortOrder?: number;
  active?: boolean;
}

function assertValidProduct(input: SubscriptionProductInput) {
  if (!input.name.trim()) throw new Error("Product name is required");
  if (input.priceCents < 0) throw new Error("Product price must not be negative");
  if (input.isUnlimited && input.classesPerWeek !== null) {
    throw new Error("An unlimited product cannot also have a fixed weekly frequency");
  }
  if (input.durationMonths !== null && input.durationMonths <= 0) {
    throw new Error("Duration must be at least one month, or empty for a single class");
  }
}

export function createSubscriptionProduct(input: SubscriptionProductInput): SubscriptionProductRow {
  assertValidProduct(input);
  return db
    .insert(subscriptionProducts)
    .values({ ...input, name: input.name.trim(), sortOrder: input.sortOrder ?? 100 })
    .returning()
    .get();
}

export function updateSubscriptionProduct(
  id: number,
  input: SubscriptionProductInput,
): SubscriptionProductRow {
  assertValidProduct(input);
  return db
    .update(subscriptionProducts)
    .set({ ...input, name: input.name.trim(), sortOrder: input.sortOrder ?? 100 })
    .where(eq(subscriptionProducts.id, id))
    .returning()
    .get();
}

/** Human-readable summary of a product's terms, e.g. "2×/week · 2 months". */
export function describeProduct(product: SubscriptionProductRow): string {
  if (product.kind === "SINGLE_CLASS") return "Single attendance";
  const frequency = product.isUnlimited ? "Unlimited" : `${product.classesPerWeek}×/week`;
  const duration =
    product.durationMonths === null
      ? null
      : `${product.durationMonths} month${product.durationMonths === 1 ? "" : "s"}`;
  return duration ? `${frequency} · ${duration}` : frequency;
}

/* ---------------------------------------------------------------- teachers */

export function listTeachers(includeInactive = false): Teacher[] {
  const all = db.select().from(teachers).orderBy(asc(teachers.name)).all();
  return includeInactive ? all : all.filter((teacher) => teacher.active);
}

export interface TeacherInput {
  name: string;
  defaultRatePerClassCents: number;
  active?: boolean;
}

export function createTeacher(input: TeacherInput): Teacher {
  if (!input.name.trim()) throw new Error("Teacher name is required");
  if (input.defaultRatePerClassCents < 0) throw new Error("Teacher rate must not be negative");
  return db
    .insert(teachers)
    .values({
      name: input.name.trim(),
      defaultRatePerClassCents: input.defaultRatePerClassCents,
      active: input.active ?? true,
    })
    .returning()
    .get();
}

export function updateTeacher(id: number, input: TeacherInput): Teacher {
  if (!input.name.trim()) throw new Error("Teacher name is required");
  if (input.defaultRatePerClassCents < 0) throw new Error("Teacher rate must not be negative");
  return db
    .update(teachers)
    .set({
      name: input.name.trim(),
      defaultRatePerClassCents: input.defaultRatePerClassCents,
      active: input.active ?? true,
    })
    .where(eq(teachers.id, id))
    .returning()
    .get();
}
