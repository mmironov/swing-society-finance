/**
 * Verifies that the integrity rules in spec §26 are enforced by the DATABASE,
 * not merely by application code. Each test writes bad data directly through
 * the ORM and expects SQLite to reject it.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  categories,
  courseOfferings,
  courses,
  financialTransactions,
  offeringExpectedSales,
  seasons,
  subscriptionProducts,
  teachers,
} from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let incomeCategoryId: number;
let expenseCategoryId: number;
let seasonId: number;
let courseId: number;

beforeEach(() => {
  db = createTestDb();

  [{ id: incomeCategoryId }] = db
    .insert(categories)
    .values({ code: "COURSE_FEES", name: "Course fees", type: "INCOME" })
    .returning({ id: categories.id })
    .all();

  [{ id: expenseCategoryId }] = db
    .insert(categories)
    .values({ code: "TEACHERS", name: "Teachers", type: "EXPENSE" })
    .returning({ id: categories.id })
    .all();

  [{ id: seasonId }] = db
    .insert(seasons)
    .values({ name: "Autumn 2026", startDate: "2026-09-15", endDate: "2026-12-20" })
    .returning({ id: seasons.id })
    .all();

  [{ id: courseId }] = db
    .insert(courses)
    .values({ name: "Swing Dance for Beginners" })
    .returning({ id: courses.id })
    .all();
});

describe("financial_transactions", () => {
  const validTransaction = () => ({
    date: "2026-10-01",
    type: "INCOME" as const,
    categoryId: incomeCategoryId,
    amountCents: 4000,
    seasonId,
  });

  it("accepts a well-formed transaction", () => {
    expect(() => db.insert(financialTransactions).values(validTransaction()).run()).not.toThrow();
  });

  it("rejects a zero or negative amount", () => {
    expect(() =>
      db.insert(financialTransactions).values({ ...validTransaction(), amountCents: 0 }).run(),
    ).toThrow(/CHECK constraint failed/i);

    expect(() =>
      db.insert(financialTransactions).values({ ...validTransaction(), amountCents: -100 }).run(),
    ).toThrow(/CHECK constraint failed/i);
  });

  it("rejects an INCOME transaction filed under an EXPENSE category", () => {
    expect(() =>
      db
        .insert(financialTransactions)
        .values({ ...validTransaction(), type: "INCOME", categoryId: expenseCategoryId })
        .run(),
    ).toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects an EXPENSE transaction filed under an INCOME category", () => {
    expect(() =>
      db
        .insert(financialTransactions)
        .values({ ...validTransaction(), type: "EXPENSE", categoryId: incomeCategoryId })
        .run(),
    ).toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("rejects a malformed date", () => {
    expect(() =>
      db.insert(financialTransactions).values({ ...validTransaction(), date: "01/10/2026" }).run(),
    ).toThrow(/CHECK constraint failed/i);
  });

  it("rejects a category that does not exist", () => {
    expect(() =>
      db.insert(financialTransactions).values({ ...validTransaction(), categoryId: 9999 }).run(),
    ).toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("refuses to delete a category that still has transactions", () => {
    db.insert(financialTransactions).values(validTransaction()).run();
    expect(() =>
      db.delete(categories).where(eq(categories.id, incomeCategoryId)).run(),
    ).toThrow(/FOREIGN KEY constraint failed/i);
  });
});

describe("seasons", () => {
  it("rejects an end date before the start date", () => {
    expect(() =>
      db
        .insert(seasons)
        .values({ name: "Backwards", startDate: "2026-12-20", endDate: "2026-09-15" })
        .run(),
    ).toThrow(/CHECK constraint failed/i);
  });

  it("allows a single-day season", () => {
    expect(() =>
      db
        .insert(seasons)
        .values({ name: "One Day", startDate: "2026-09-15", endDate: "2026-09-15" })
        .run(),
    ).not.toThrow();
  });
});

describe("course_offerings", () => {
  const validOffering = () => ({
    courseId,
    seasonId,
    startDate: "2026-09-15",
    endDate: "2026-12-20",
    classesPerWeek: 1,
    weeks: 14,
    capacity: 30,
    expectedStudents: 25,
  });

  it("rejects negative capacity, students, weeks and classes", () => {
    for (const patch of [
      { capacity: -1 },
      { expectedStudents: -1 },
      { weeks: -1 },
      { classesPerWeek: -1 },
      { minutesPerClass: -1 },
      { studioHourlyRateCents: -1 },
    ]) {
      expect(() =>
        db.insert(courseOfferings).values({ ...validOffering(), ...patch }).run(),
      ).toThrow(/CHECK constraint failed/i);
    }
  });

  it("allows a null studio rate, meaning 'not planned yet'", () => {
    expect(() =>
      db.insert(courseOfferings).values({ ...validOffering(), studioHourlyRateCents: null }).run(),
    ).not.toThrow();
  });

  it("prevents the same course being offered twice in one season", () => {
    db.insert(courseOfferings).values(validOffering()).run();
    expect(() => db.insert(courseOfferings).values(validOffering()).run()).toThrow(
      /UNIQUE constraint failed/i,
    );
  });

  it("cascades deletion of a season to its offerings", () => {
    db.insert(courseOfferings).values(validOffering()).run();
    db.delete(seasons).where(eq(seasons.id, seasonId)).run();
    expect(db.select().from(courseOfferings).all()).toHaveLength(0);
  });
});

describe("subscription_products", () => {
  it("rejects a negative price", () => {
    expect(() =>
      db.insert(subscriptionProducts).values({ name: "Bad", priceCents: -1 }).run(),
    ).toThrow(/CHECK constraint failed/i);
  });

  it("allows a free product", () => {
    expect(() =>
      db.insert(subscriptionProducts).values({ name: "Free trial", priceCents: 0 }).run(),
    ).not.toThrow();
  });

  it("rejects an unlimited product that also claims a weekly frequency", () => {
    expect(() =>
      db
        .insert(subscriptionProducts)
        .values({ name: "Contradictory", priceCents: 8000, isUnlimited: true, classesPerWeek: 2 })
        .run(),
    ).toThrow(/CHECK constraint failed/i);
  });

  it("rejects a zero-month duration", () => {
    expect(() =>
      db
        .insert(subscriptionProducts)
        .values({ name: "Zero months", priceCents: 4000, durationMonths: 0 })
        .run(),
    ).toThrow(/CHECK constraint failed/i);
  });
});

describe("teachers and expected sales", () => {
  it("rejects a negative default teacher rate", () => {
    expect(() =>
      db.insert(teachers).values({ name: "Bad rate", defaultRatePerClassCents: -1 }).run(),
    ).toThrow(/CHECK constraint failed/i);
  });

  it("rejects a negative expected sales quantity", () => {
    const [{ id: offeringId }] = db
      .insert(courseOfferings)
      .values({ courseId, seasonId, startDate: "2026-09-15", endDate: "2026-12-20" })
      .returning({ id: courseOfferings.id })
      .all();
    const [{ id: productId }] = db
      .insert(subscriptionProducts)
      .values({ name: "1 class/week — 1 month", priceCents: 4000 })
      .returning({ id: subscriptionProducts.id })
      .all();

    expect(() =>
      db.insert(offeringExpectedSales).values({ offeringId, productId, quantity: -1 }).run(),
    ).toThrow(/CHECK constraint failed/i);
  });
});

