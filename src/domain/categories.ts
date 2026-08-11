/**
 * Financial categories.
 *
 * Categories are DATA, not a hard-coded enum: they live in the `categories`
 * table and new ones can be added at runtime (spec §7 "the category system
 * should be extensible"). The codes below are only the defaults that ship with
 * the application and are referenced by the seed and by the P&L report ordering.
 */

export type TransactionType = "INCOME" | "EXPENSE";

export interface CategoryDefinition {
  code: string;
  name: string;
  type: TransactionType;
  sortOrder: number;
}

export const DEFAULT_INCOME_CATEGORIES: CategoryDefinition[] = [
  { code: "COURSE_FEES", name: "Course fees", type: "INCOME", sortOrder: 10 },
  { code: "WORKSHOP_TICKETS", name: "Workshop tickets", type: "INCOME", sortOrder: 20 },
  { code: "SWING_BUZZ_INCOME", name: "Swing Buzz", type: "INCOME", sortOrder: 30 },
  { code: "PARTIES", name: "Parties", type: "INCOME", sortOrder: 40 },
  { code: "OTHER_INCOME", name: "Other income", type: "INCOME", sortOrder: 90 },
];

export const DEFAULT_EXPENSE_CATEGORIES: CategoryDefinition[] = [
  { code: "TEACHERS", name: "Teachers", type: "EXPENSE", sortOrder: 10 },
  { code: "STUDIO_RENT", name: "Studio rent", type: "EXPENSE", sortOrder: 20 },
  { code: "MARKETING", name: "Marketing", type: "EXPENSE", sortOrder: 30 },
  { code: "SWING_BUZZ_EXPENSE", name: "Swing Buzz", type: "EXPENSE", sortOrder: 40 },
  { code: "ADMINISTRATION", name: "Administration", type: "EXPENSE", sortOrder: 50 },
  { code: "OTHER_EXPENSE", name: "Other expenses", type: "EXPENSE", sortOrder: 90 },
];

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  ...DEFAULT_INCOME_CATEGORIES,
  ...DEFAULT_EXPENSE_CATEGORIES,
];

/**
 * Swing Buzz appears on both sides of the P&L, so it needs two distinct codes.
 * A single shared code would break the composite (id, type) foreign key that
 * enforces "category must match transaction type" at the database level.
 */
export const SWING_BUZZ_INCOME = "SWING_BUZZ_INCOME";
export const SWING_BUZZ_EXPENSE = "SWING_BUZZ_EXPENSE";

/**
 * Categories whose season forecast is DERIVED from the course planner rather
 * than entered by hand. Manual season forecast lines are rejected for these to
 * prevent double-counting the same euro.
 */
export const PLANNER_DERIVED_CATEGORY_CODES = ["COURSE_FEES", "TEACHERS", "STUDIO_RENT"] as const;

export type PlannerDerivedCategoryCode = (typeof PLANNER_DERIVED_CATEGORY_CODES)[number];

export function isPlannerDerivedCategory(code: string): code is PlannerDerivedCategoryCode {
  return (PLANNER_DERIVED_CATEGORY_CODES as readonly string[]).includes(code);
}
