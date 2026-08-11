/**
 * Database schema (SQLite via Drizzle).
 *
 * Conventions used throughout:
 *  - Money is stored as INTEGER cents (see src/domain/money.ts).
 *  - Durations are stored as INTEGER minutes, never fractional hours, so no
 *    float ever reaches the database.
 *  - Dates are stored as ISO "YYYY-MM-DD" text. SQLite has no date type, and
 *    ISO text sorts and compares correctly while staying timezone-free.
 *  - Validation lives in CHECK constraints, not only in the UI (spec §26).
 */

import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

/* ----------------------------------------------------------------- app meta */

/**
 * Small key/value store for application-level facts. Currently used to record
 * that the database was populated with demo data, so the UI can say so plainly
 * instead of presenting invented numbers as real ones (spec §30).
 */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const DEMO_DATA_KEY = "demo_data_seeded_at";

/* ------------------------------------------------------------------ seasons */

export const seasons = sqliteTable(
  "seasons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status", { enum: ["PLANNING", "ACTIVE", "CLOSED"] })
      .notNull()
      .default("PLANNING"),
    createdAt: createdAt(),
  },
  (table) => [
    check("seasons_dates_ordered", sql`${table.endDate} >= ${table.startDate}`),
    check("seasons_start_date_iso", sql`${table.startDate} LIKE '____-__-__'`),
    check("seasons_end_date_iso", sql`${table.endDate} LIKE '____-__-__'`),
  ],
);

/* --------------------------------------------------------------- categories */

/**
 * Categories are data rather than an enum so new ones can be added at runtime.
 * The (id, type) unique index exists so `financial_transactions` can carry a
 * composite foreign key that makes "category must match transaction type"
 * a database guarantee rather than an application convention.
 */
export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: text("type", { enum: ["INCOME", "EXPENSE"] }).notNull(),
    sortOrder: integer("sort_order").notNull().default(100),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("categories_id_type_unique").on(table.id, table.type)],
);

/* --------------------------------------------------------------- activities */

/**
 * A deliberately thin link between a transaction and the thing that caused it.
 * `kind` leaves room for workshops, parties and the festival to become real
 * entities later without changing the transaction table (spec §8, §31).
 */
export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["COURSE", "WORKSHOP", "PARTY", "FESTIVAL", "GENERAL"],
    })
      .notNull()
      .default("GENERAL"),
    courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("activities_name_unique").on(table.name)],
);

/* --------------------------------------------------- financial transactions */

export const financialTransactions = sqliteTable(
  "financial_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    type: text("type", { enum: ["INCOME", "EXPENSE"] }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    /** Always POSITIVE. Direction is carried by `type`, never by the sign. */
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull().default(""),
    seasonId: integer("season_id").references(() => seasons.id, { onDelete: "set null" }),
    activityId: integer("activity_id").references(() => activities.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method", {
      enum: ["BANK", "CASH", "CARD", "ONLINE", "OTHER"],
    })
      .notNull()
      .default("BANK"),
    status: text("status", { enum: ["PENDING", "SETTLED"] })
      .notNull()
      .default("SETTLED"),
    createdAt: createdAt(),
  },
  (table) => [
    // Enforces "category must match transaction type" in the database.
    foreignKey({
      columns: [table.categoryId, table.type],
      foreignColumns: [categories.id, categories.type],
      name: "transactions_category_type_fk",
    }),
    check("transactions_amount_positive", sql`${table.amountCents} > 0`),
    check("transactions_date_iso", sql`${table.date} LIKE '____-__-__'`),
    index("transactions_date_idx").on(table.date),
    index("transactions_season_idx").on(table.seasonId),
    index("transactions_category_idx").on(table.categoryId),
  ],
);

/* ------------------------------------------------------------------ courses */

export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(100),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/**
 * A course RUN IN A SEASON. Courses themselves are season-independent so that
 * "Lindy Hop — Intermediate" keeps one identity across years (spec §4).
 */
export const courseOfferings = sqliteTable(
  "course_offerings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    classesPerWeek: integer("classes_per_week").notNull().default(1),
    weeks: integer("weeks").notNull().default(0),
    capacity: integer("capacity").notNull().default(0),
    expectedStudents: integer("expected_students").notNull().default(0),
    /** Length of one class, in minutes — the basis for the studio cost. */
    minutesPerClass: integer("minutes_per_class").notNull().default(90),
    /** Null means no studio cost has been planned for this offering yet. */
    studioHourlyRateCents: integer("studio_hourly_rate_cents"),
    status: text("status", { enum: ["PLANNED", "RUNNING", "FINISHED", "CANCELLED"] })
      .notNull()
      .default("PLANNED"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("course_offerings_course_season_unique").on(table.courseId, table.seasonId),
    check("offerings_dates_ordered", sql`${table.endDate} >= ${table.startDate}`),
    check("offerings_classes_per_week_non_negative", sql`${table.classesPerWeek} >= 0`),
    check("offerings_weeks_non_negative", sql`${table.weeks} >= 0`),
    check("offerings_capacity_non_negative", sql`${table.capacity} >= 0`),
    check("offerings_expected_students_non_negative", sql`${table.expectedStudents} >= 0`),
    check("offerings_minutes_per_class_non_negative", sql`${table.minutesPerClass} >= 0`),
    check(
      "offerings_studio_rate_non_negative",
      sql`${table.studioHourlyRateCents} IS NULL OR ${table.studioHourlyRateCents} >= 0`,
    ),
    index("course_offerings_season_idx").on(table.seasonId),
  ],
);

/* ---------------------------------------------------- subscription products */

export const subscriptionProducts = sqliteTable(
  "subscription_products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    /** Null when unlimited — the frequency is not a number in that case. */
    classesPerWeek: integer("classes_per_week"),
    /** Null for a single class, which has no monthly duration. */
    durationMonths: integer("duration_months"),
    priceCents: integer("price_cents").notNull(),
    isUnlimited: integer("is_unlimited", { mode: "boolean" }).notNull().default(false),
    kind: text("kind", { enum: ["SUBSCRIPTION", "SINGLE_CLASS"] })
      .notNull()
      .default("SUBSCRIPTION"),
    sortOrder: integer("sort_order").notNull().default(100),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    check("products_price_non_negative", sql`${table.priceCents} >= 0`),
    check(
      "products_classes_per_week_non_negative",
      sql`${table.classesPerWeek} IS NULL OR ${table.classesPerWeek} >= 0`,
    ),
    check(
      "products_duration_positive",
      sql`${table.durationMonths} IS NULL OR ${table.durationMonths} > 0`,
    ),
    // An unlimited product must not also claim a specific weekly frequency.
    check(
      "products_unlimited_has_no_frequency",
      sql`${table.isUnlimited} = 0 OR ${table.classesPerWeek} IS NULL`,
    ),
  ],
);

/** The expected subscription mix for an offering (spec §13). */
export const offeringExpectedSales = sqliteTable(
  "offering_expected_sales",
  {
    offeringId: integer("offering_id")
      .notNull()
      .references(() => courseOfferings.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => subscriptionProducts.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.offeringId, table.productId] }),
    check("expected_sales_quantity_non_negative", sql`${table.quantity} >= 0`),
  ],
);

/* ----------------------------------------------------------------- teachers */

export const teachers = sqliteTable(
  "teachers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    /** Suggested rate, copied into an assignment as its starting value. */
    defaultRatePerClassCents: integer("default_rate_per_class_cents").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    check("teachers_default_rate_non_negative", sql`${table.defaultRatePerClassCents} >= 0`),
  ],
);

/**
 * One row per teacher per offering. Rates live here rather than on the teacher
 * so a teacher can be paid differently on different courses (spec §11).
 */
export const offeringTeacherCosts = sqliteTable(
  "offering_teacher_costs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offeringId: integer("offering_id")
      .notNull()
      .references(() => courseOfferings.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    classes: integer("classes").notNull().default(0),
    ratePerClassCents: integer("rate_per_class_cents").notNull().default(0),
  },
  (table) => [
    uniqueIndex("offering_teacher_unique").on(table.offeringId, table.teacherId),
    check("teacher_costs_classes_non_negative", sql`${table.classes} >= 0`),
    check("teacher_costs_rate_non_negative", sql`${table.ratePerClassCents} >= 0`),
  ],
);

/* -------------------------------------------------- season forecast (other) */

/**
 * Forecast amounts for things the course planner does not model — workshops,
 * parties, the festival, marketing, administration.
 *
 * Course fees, teacher costs and studio costs are DERIVED from the offerings
 * and must never appear here; the service layer rejects those categories so the
 * same euro cannot be counted twice.
 */
export const seasonForecastLines = sqliteTable(
  "season_forecast_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["INCOME", "EXPENSE"] }).notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    note: text("note").notNull().default(""),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId, table.type],
      foreignColumns: [categories.id, categories.type],
      name: "forecast_lines_category_type_fk",
    }),
    uniqueIndex("forecast_lines_season_category_unique").on(table.seasonId, table.categoryId),
    check("forecast_lines_amount_non_negative", sql`${table.amountCents} >= 0`),
  ],
);

/* ------------------------------------------------- students & subscriptions */

/**
 * SCHEMA ONLY in MVP 1/2 — no UI, no services.
 *
 * These exist now because spec §6 requires the *model* to express that a
 * subscription may grant access to several course offerings. Adding them up
 * front means a future attendance-weighted revenue allocation can be built
 * without migrating the financial core.
 */
export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => subscriptionProducts.id, { onDelete: "restrict" }),
    seasonId: integer("season_id").references(() => seasons.id, { onDelete: "set null" }),
    purchasedOn: text("purchased_on").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    pricePaidCents: integer("price_paid_cents").notNull(),
    createdAt: createdAt(),
  },
  (table) => [check("subscriptions_price_non_negative", sql`${table.pricePaidCents} >= 0`)],
);

/** The many-to-many that keeps revenue from being pinned to a single course. */
export const subscriptionCourseOfferings = sqliteTable(
  "subscription_course_offerings",
  {
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    offeringId: integer("offering_id")
      .notNull()
      .references(() => courseOfferings.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.subscriptionId, table.offeringId] })],
);

/* ---------------------------------------------------------------- relations */

export const seasonsRelations = relations(seasons, ({ many }) => ({
  transactions: many(financialTransactions),
  offerings: many(courseOfferings),
  forecastLines: many(seasonForecastLines),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(financialTransactions),
  forecastLines: many(seasonForecastLines),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  offerings: many(courseOfferings),
}));

export const courseOfferingsRelations = relations(courseOfferings, ({ one, many }) => ({
  course: one(courses, { fields: [courseOfferings.courseId], references: [courses.id] }),
  season: one(seasons, { fields: [courseOfferings.seasonId], references: [seasons.id] }),
  expectedSales: many(offeringExpectedSales),
  teacherCosts: many(offeringTeacherCosts),
}));

export const financialTransactionsRelations = relations(financialTransactions, ({ one }) => ({
  category: one(categories, {
    fields: [financialTransactions.categoryId],
    references: [categories.id],
  }),
  season: one(seasons, { fields: [financialTransactions.seasonId], references: [seasons.id] }),
  activity: one(activities, {
    fields: [financialTransactions.activityId],
    references: [activities.id],
  }),
}));

export const offeringExpectedSalesRelations = relations(offeringExpectedSales, ({ one }) => ({
  offering: one(courseOfferings, {
    fields: [offeringExpectedSales.offeringId],
    references: [courseOfferings.id],
  }),
  product: one(subscriptionProducts, {
    fields: [offeringExpectedSales.productId],
    references: [subscriptionProducts.id],
  }),
}));

export const offeringTeacherCostsRelations = relations(offeringTeacherCosts, ({ one }) => ({
  offering: one(courseOfferings, {
    fields: [offeringTeacherCosts.offeringId],
    references: [courseOfferings.id],
  }),
  teacher: one(teachers, { fields: [offeringTeacherCosts.teacherId], references: [teachers.id] }),
}));

export const seasonForecastLinesRelations = relations(seasonForecastLines, ({ one }) => ({
  season: one(seasons, { fields: [seasonForecastLines.seasonId], references: [seasons.id] }),
  category: one(categories, {
    fields: [seasonForecastLines.categoryId],
    references: [categories.id],
  }),
}));

export type Season = typeof seasons.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type CourseOffering = typeof courseOfferings.$inferSelect;
export type SubscriptionProductRow = typeof subscriptionProducts.$inferSelect;
export type Teacher = typeof teachers.$inferSelect;
export type OfferingTeacherCost = typeof offeringTeacherCosts.$inferSelect;
export type SeasonForecastLine = typeof seasonForecastLines.$inferSelect;
