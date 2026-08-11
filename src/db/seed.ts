/**
 * Development / demo seed data.
 *
 * EVERYTHING THIS SCRIPT WRITES IS FICTIONAL. It exists so that every screen
 * has something meaningful to show on a fresh checkout. A marker row is written
 * to `app_meta`, and the UI shows a "demo data" banner while that marker is
 * present — real figures should never be mistaken for these.
 *
 * Running this script REPLACES all existing data. Run with `npm run db:seed`.
 */

import { sql } from "drizzle-orm";

import { eurosToCents } from "@/domain/money";

import { db } from "./client";
import { runMigrations } from "./migrate";
import {
  activities,
  appMeta,
  categories,
  courseOfferings,
  courses,
  DEMO_DATA_KEY,
  financialTransactions,
  offeringExpectedSales,
  offeringTeacherCosts,
  seasonForecastLines,
  seasons,
  subscriptionCourseOfferings,
  subscriptionProducts,
  subscriptions,
  students,
  teachers,
} from "./schema";
import { DEFAULT_CATEGORIES } from "@/domain/categories";

function clearAll() {
  // Children before parents — foreign keys are enforced.
  db.delete(subscriptionCourseOfferings).run();
  db.delete(subscriptions).run();
  db.delete(students).run();
  db.delete(offeringExpectedSales).run();
  db.delete(offeringTeacherCosts).run();
  db.delete(financialTransactions).run();
  db.delete(seasonForecastLines).run();
  db.delete(courseOfferings).run();
  db.delete(activities).run();
  db.delete(courses).run();
  db.delete(subscriptionProducts).run();
  db.delete(teachers).run();
  db.delete(categories).run();
  db.delete(seasons).run();
  db.delete(appMeta).run();
  // Reset autoincrement counters so seeded ids are stable between runs.
  db.run(sql`DELETE FROM sqlite_sequence`);
}

export function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data in production");
  }

  runMigrations();

  db.transaction(() => {
    clearAll();

    /* ------------------------------------------------------------ categories */

    const categoryRows = db
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((category) => ({ ...category, isSystem: true })))
      .returning()
      .all();
    const category = (code: string) => {
      const row = categoryRows.find((c) => c.code === code);
      if (!row) throw new Error(`missing seeded category ${code}`);
      return row.id;
    };

    /* --------------------------------------------------------------- courses */

    const courseRows = db
      .insert(courses)
      .values([
        { name: "Swing Dance for Beginners", sortOrder: 10, description: "Entry-level swing course" },
        { name: "Lindy Hop — Intermediate", sortOrder: 20, description: "For dancers with a season behind them" },
        { name: "Lindy Hop — Advanced", sortOrder: 30, description: "Fast tempos and improvisation" },
        { name: "Jazz", sortOrder: 40, description: "Solo jazz technique and routines" },
      ])
      .returning()
      .all();
    const course = (name: string) => {
      const row = courseRows.find((c) => c.name.startsWith(name));
      if (!row) throw new Error(`missing seeded course ${name}`);
      return row.id;
    };

    /* ------------------------------------------------------------ activities */

    const activityRows = db
      .insert(activities)
      .values([
        { name: "Beginners", kind: "COURSE" as const, courseId: course("Swing Dance") },
        { name: "Intermediate", kind: "COURSE" as const, courseId: course("Lindy Hop — Intermediate") },
        { name: "Advanced", kind: "COURSE" as const, courseId: course("Lindy Hop — Advanced") },
        { name: "Jazz", kind: "COURSE" as const, courseId: course("Jazz") },
        { name: "Workshop", kind: "WORKSHOP" as const },
        { name: "Party", kind: "PARTY" as const },
        { name: "Swing Buzz", kind: "FESTIVAL" as const },
        { name: "General", kind: "GENERAL" as const },
      ])
      .returning()
      .all();
    const activity = (name: string) => activityRows.find((a) => a.name === name)?.id ?? null;

    /* -------------------------------------------- subscription products (§5) */

    const productRows = db
      .insert(subscriptionProducts)
      .values([
        { name: "1 class/week — 1 month", classesPerWeek: 1, durationMonths: 1, priceCents: eurosToCents(40), sortOrder: 10 },
        { name: "1 class/week — 2 months", classesPerWeek: 1, durationMonths: 2, priceCents: eurosToCents(60), sortOrder: 20 },
        { name: "2 classes/week — 1 month", classesPerWeek: 2, durationMonths: 1, priceCents: eurosToCents(60), sortOrder: 30 },
        { name: "2 classes/week — 2 months", classesPerWeek: 2, durationMonths: 2, priceCents: eurosToCents(100), sortOrder: 40 },
        { name: "Unlimited — 1 month", classesPerWeek: null, durationMonths: 1, priceCents: eurosToCents(80), isUnlimited: true, sortOrder: 50 },
        { name: "Unlimited — 2 months", classesPerWeek: null, durationMonths: 2, priceCents: eurosToCents(120), isUnlimited: true, sortOrder: 60 },
        { name: "Single class", classesPerWeek: 1, durationMonths: null, priceCents: eurosToCents(20), kind: "SINGLE_CLASS" as const, sortOrder: 70 },
      ])
      .returning()
      .all();
    const product = (name: string) => {
      const row = productRows.find((p) => p.name === name);
      if (!row) throw new Error(`missing seeded product ${name}`);
      return row.id;
    };

    /* -------------------------------------------------------------- teachers */

    const teacherRows = db
      .insert(teachers)
      .values([
        { name: "Marta Kovač", defaultRatePerClassCents: eurosToCents(50) },
        { name: "Ivan Petrov", defaultRatePerClassCents: eurosToCents(50) },
        { name: "Sofia Lindqvist", defaultRatePerClassCents: eurosToCents(60) },
        { name: "Tomás Reyes", defaultRatePerClassCents: eurosToCents(45) },
      ])
      .returning()
      .all();
    const teacher = (name: string) => {
      const row = teacherRows.find((t) => t.name.startsWith(name));
      if (!row) throw new Error(`missing seeded teacher ${name}`);
      return row.id;
    };

    /* --------------------------------------------------------------- seasons */

    const [springSeason, autumnSeason] = db
      .insert(seasons)
      .values([
        { name: "Spring 2026", startDate: "2026-01-12", endDate: "2026-04-30", status: "CLOSED" as const },
        { name: "Autumn 2026", startDate: "2026-09-15", endDate: "2026-12-20", status: "PLANNING" as const },
      ])
      .returning()
      .all();

    /* ------------------------------------------- Autumn 2026 course planning */

    const AUTUMN_WEEKS = 14;
    const autumnPlans = [
      { courseName: "Swing Dance", capacity: 30, expectedStudents: 25, teachers: ["Marta", "Ivan"], rate: 50 },
      { courseName: "Lindy Hop — Intermediate", capacity: 25, expectedStudents: 20, teachers: ["Marta", "Ivan"], rate: 50 },
      { courseName: "Lindy Hop — Advanced", capacity: 20, expectedStudents: 14, teachers: ["Sofia"], rate: 60 },
      { courseName: "Jazz", capacity: 25, expectedStudents: 18, teachers: ["Tomás"], rate: 45 },
    ];

    // A plausible subscription mix per course, scaled to its expected students.
    const salesMix: [string, number][] = [
      ["1 class/week — 1 month", 0.4],
      ["1 class/week — 2 months", 0.6],
      ["2 classes/week — 1 month", 0.2],
      ["2 classes/week — 2 months", 0.4],
      ["Unlimited — 1 month", 0.12],
      ["Unlimited — 2 months", 0.2],
      ["Single class", 0.6],
    ];

    for (const plan of autumnPlans) {
      const offering = db
        .insert(courseOfferings)
        .values({
          courseId: course(plan.courseName),
          seasonId: autumnSeason.id,
          startDate: autumnSeason.startDate,
          endDate: autumnSeason.endDate,
          classesPerWeek: 1,
          weeks: AUTUMN_WEEKS,
          capacity: plan.capacity,
          expectedStudents: plan.expectedStudents,
          minutesPerClass: 120,
          studioHourlyRateCents: eurosToCents(20),
          status: "PLANNED" as const,
        })
        .returning()
        .get();

      db.insert(offeringExpectedSales)
        .values(
          salesMix.map(([productName, share]) => ({
            offeringId: offering.id,
            productId: product(productName),
            quantity: Math.round(plan.expectedStudents * share),
          })),
        )
        .run();

      db.insert(offeringTeacherCosts)
        .values(
          plan.teachers.map((teacherName) => ({
            offeringId: offering.id,
            teacherId: teacher(teacherName),
            classes: AUTUMN_WEEKS,
            ratePerClassCents: eurosToCents(plan.rate),
          })),
        )
        .run();
    }

    // Non-course forecast lines for Autumn 2026 (§16).
    db.insert(seasonForecastLines)
      .values([
        { seasonId: autumnSeason.id, categoryId: category("WORKSHOP_TICKETS"), type: "INCOME" as const, amountCents: eurosToCents(2400) },
        { seasonId: autumnSeason.id, categoryId: category("PARTIES"), type: "INCOME" as const, amountCents: eurosToCents(1800) },
        { seasonId: autumnSeason.id, categoryId: category("SWING_BUZZ_INCOME"), type: "INCOME" as const, amountCents: eurosToCents(6000) },
        { seasonId: autumnSeason.id, categoryId: category("MARKETING"), type: "EXPENSE" as const, amountCents: eurosToCents(1200) },
        { seasonId: autumnSeason.id, categoryId: category("ADMINISTRATION"), type: "EXPENSE" as const, amountCents: eurosToCents(600) },
        { seasonId: autumnSeason.id, categoryId: category("SWING_BUZZ_EXPENSE"), type: "EXPENSE" as const, amountCents: eurosToCents(4500) },
      ])
      .run();

    /* -------------------------------- Spring 2026: a completed season's plan */

    for (const plan of autumnPlans) {
      const offering = db
        .insert(courseOfferings)
        .values({
          courseId: course(plan.courseName),
          seasonId: springSeason.id,
          startDate: springSeason.startDate,
          endDate: springSeason.endDate,
          classesPerWeek: 1,
          weeks: 15,
          capacity: plan.capacity,
          expectedStudents: plan.expectedStudents,
          minutesPerClass: 120,
          studioHourlyRateCents: eurosToCents(19),
          status: "FINISHED" as const,
        })
        .returning()
        .get();

      db.insert(offeringExpectedSales)
        .values(
          salesMix.map(([productName, share]) => ({
            offeringId: offering.id,
            productId: product(productName),
            quantity: Math.round(plan.expectedStudents * share),
          })),
        )
        .run();

      db.insert(offeringTeacherCosts)
        .values(
          plan.teachers.map((teacherName) => ({
            offeringId: offering.id,
            teacherId: teacher(teacherName),
            classes: 15,
            ratePerClassCents: eurosToCents(plan.rate),
          })),
        )
        .run();
    }

    db.insert(seasonForecastLines)
      .values([
        { seasonId: springSeason.id, categoryId: category("WORKSHOP_TICKETS"), type: "INCOME" as const, amountCents: eurosToCents(2000) },
        { seasonId: springSeason.id, categoryId: category("PARTIES"), type: "INCOME" as const, amountCents: eurosToCents(1500) },
        { seasonId: springSeason.id, categoryId: category("MARKETING"), type: "EXPENSE" as const, amountCents: eurosToCents(1000) },
        { seasonId: springSeason.id, categoryId: category("ADMINISTRATION"), type: "EXPENSE" as const, amountCents: eurosToCents(500) },
      ])
      .run();

    /* ------------------------------------------- Spring 2026 actual bookings */

    type Tx = {
      date: string;
      type: "INCOME" | "EXPENSE";
      categoryCode: string;
      euros: number;
      description: string;
      activityName?: string;
      seasonId: number;
    };

    const springTransactions: Tx[] = [];
    const springMonths = ["2026-01", "2026-02", "2026-03", "2026-04"];

    // Course fees arrive monthly per course, tapering as the season ends.
    // These are calibrated to land within a few percent of the Spring plan, so
    // the forecast-vs-actual screen shows a realistic near-miss rather than an
    // implausible blowout.
    const courseFeeByActivity: Record<string, number[]> = {
      Beginners: [1150, 1050, 950, 750], // €3,900 vs €3,740 planned
      Intermediate: [850, 780, 700, 520], // €2,850 vs €2,960 planned
      Advanced: [620, 560, 500, 390], // €2,070 vs €2,180 planned
      Jazz: [900, 820, 720, 560], // €3,000 vs €2,740 planned
    };

    for (const [activityName, amounts] of Object.entries(courseFeeByActivity)) {
      amounts.forEach((euros, index) => {
        springTransactions.push({
          date: `${springMonths[index]}-05`,
          type: "INCOME",
          categoryCode: "COURSE_FEES",
          euros,
          description: `${activityName} — subscriptions`,
          activityName,
          seasonId: springSeason.id,
        });
      });
    }

    for (const [index, month] of springMonths.entries()) {
      springTransactions.push(
        {
          date: `${month}-28`,
          type: "EXPENSE",
          categoryCode: "TEACHERS",
          euros: [1150, 1150, 1150, 1000][index],
          description: "Teacher fees",
          activityName: "General",
          seasonId: springSeason.id,
        },
        {
          date: `${month}-01`,
          type: "EXPENSE",
          categoryCode: "STUDIO_RENT",
          euros: [580, 580, 580, 560][index],
          description: "Studio hire",
          activityName: "General",
          seasonId: springSeason.id,
        },
        {
          date: `${month}-10`,
          type: "EXPENSE",
          categoryCode: "MARKETING",
          euros: [420, 260, 240, 180][index],
          description: "Social media and flyers",
          activityName: "General",
          seasonId: springSeason.id,
        },
        {
          date: `${month}-15`,
          type: "EXPENSE",
          categoryCode: "ADMINISTRATION",
          euros: [130, 120, 125, 120][index],
          description: "Accounting and bank charges",
          activityName: "General",
          seasonId: springSeason.id,
        },
      );
    }

    springTransactions.push(
      { date: "2026-02-14", type: "INCOME", categoryCode: "PARTIES", euros: 780, description: "Valentine's swing party", activityName: "Party", seasonId: springSeason.id },
      { date: "2026-04-18", type: "INCOME", categoryCode: "PARTIES", euros: 690, description: "End-of-season party", activityName: "Party", seasonId: springSeason.id },
      { date: "2026-03-21", type: "INCOME", categoryCode: "WORKSHOP_TICKETS", euros: 1450, description: "Charleston weekend workshop", activityName: "Workshop", seasonId: springSeason.id },
      { date: "2026-03-22", type: "EXPENSE", categoryCode: "TEACHERS", euros: 600, description: "Guest teachers — Charleston weekend", activityName: "Workshop", seasonId: springSeason.id },
      { date: "2026-04-30", type: "INCOME", categoryCode: "OTHER_INCOME", euros: 220, description: "Merchandise sales", activityName: "General", seasonId: springSeason.id },
    );

    // Autumn 2026 has started spending before the season opens (§23 needs
    // partial actuals for the forecast comparison to be interesting).
    const autumnTransactions: Tx[] = [
      { date: "2026-07-20", type: "EXPENSE", categoryCode: "MARKETING", euros: 480, description: "Autumn campaign — early booking ads", activityName: "General", seasonId: autumnSeason.id },
      { date: "2026-08-03", type: "EXPENSE", categoryCode: "STUDIO_RENT", euros: 900, description: "Studio deposit for autumn term", activityName: "General", seasonId: autumnSeason.id },
      { date: "2026-08-05", type: "INCOME", categoryCode: "COURSE_FEES", euros: 1240, description: "Early-bird subscriptions", activityName: "Beginners", seasonId: autumnSeason.id },
      { date: "2026-08-09", type: "INCOME", categoryCode: "COURSE_FEES", euros: 860, description: "Early-bird subscriptions", activityName: "Intermediate", seasonId: autumnSeason.id },
      { date: "2026-08-10", type: "EXPENSE", categoryCode: "ADMINISTRATION", euros: 145, description: "Insurance renewal", activityName: "General", seasonId: autumnSeason.id },
    ];

    db.insert(financialTransactions)
      .values(
        [...springTransactions, ...autumnTransactions].map((transaction) => ({
          date: transaction.date,
          type: transaction.type,
          categoryId: category(transaction.categoryCode),
          amountCents: eurosToCents(transaction.euros),
          description: transaction.description,
          seasonId: transaction.seasonId,
          activityId: transaction.activityName ? activity(transaction.activityName) : null,
          paymentMethod: "BANK" as const,
          status: "SETTLED" as const,
        })),
      )
      .run();

    db.insert(appMeta)
      .values({ key: DEMO_DATA_KEY, value: new Date().toISOString() })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: new Date().toISOString() } })
      .run();
  });
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed();
  console.log("Demo data seeded. Every figure in the database is fictional.");
}
