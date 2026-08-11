/**
 * Reading and writing financial transactions — the core of MVP 1.
 */

import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activities,
  categories,
  type FinancialTransaction,
  financialTransactions,
  seasons,
} from "@/db/schema";
import type { TransactionType } from "@/domain/categories";
import type { PnlTransaction } from "@/domain/finance/pnl";

import { isIsoDate } from "./seasons";

export interface TransactionFilters {
  from?: string;
  to?: string;
  seasonId?: number;
  type?: TransactionType;
  categoryId?: number;
  activityId?: number;
}

export interface TransactionRow {
  id: number;
  date: string;
  type: TransactionType;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  categorySortOrder: number;
  activityId: number | null;
  activityName: string | null;
  seasonId: number | null;
  seasonName: string | null;
  description: string;
  amountCents: number;
  paymentMethod: FinancialTransaction["paymentMethod"];
  status: FinancialTransaction["status"];
}

function buildConditions(filters: TransactionFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(financialTransactions.date, filters.from));
  if (filters.to) conditions.push(lte(financialTransactions.date, filters.to));
  if (filters.seasonId !== undefined) {
    conditions.push(eq(financialTransactions.seasonId, filters.seasonId));
  }
  if (filters.type) conditions.push(eq(financialTransactions.type, filters.type));
  if (filters.categoryId !== undefined) {
    conditions.push(eq(financialTransactions.categoryId, filters.categoryId));
  }
  if (filters.activityId !== undefined) {
    conditions.push(eq(financialTransactions.activityId, filters.activityId));
  }
  return conditions;
}

export function listTransactions(filters: TransactionFilters = {}, limit?: number): TransactionRow[] {
  const conditions = buildConditions(filters);

  const query = db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.date,
      type: financialTransactions.type,
      categoryId: financialTransactions.categoryId,
      categoryCode: categories.code,
      categoryName: categories.name,
      categorySortOrder: categories.sortOrder,
      activityId: financialTransactions.activityId,
      activityName: activities.name,
      seasonId: financialTransactions.seasonId,
      seasonName: seasons.name,
      description: financialTransactions.description,
      amountCents: financialTransactions.amountCents,
      paymentMethod: financialTransactions.paymentMethod,
      status: financialTransactions.status,
    })
    .from(financialTransactions)
    .innerJoin(categories, eq(financialTransactions.categoryId, categories.id))
    .leftJoin(activities, eq(financialTransactions.activityId, activities.id))
    .leftJoin(seasons, eq(financialTransactions.seasonId, seasons.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(financialTransactions.date), desc(financialTransactions.id));

  return limit ? query.limit(limit).all() : query.all();
}

/** Shape the P&L and dashboard calculations consume. */
export function listPnlTransactions(
  filters: TransactionFilters = {},
): (PnlTransaction & { date: string })[] {
  return listTransactions(filters).map((row) => ({
    date: row.date,
    type: row.type,
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    categorySortOrder: row.categorySortOrder,
    amountCents: row.amountCents,
  }));
}

export interface TransactionInput {
  date: string;
  type: TransactionType;
  categoryId: number;
  amountCents: number;
  description?: string;
  seasonId?: number | null;
  activityId?: number | null;
  paymentMethod?: FinancialTransaction["paymentMethod"];
  status?: FinancialTransaction["status"];
}

function assertValidTransaction(input: TransactionInput) {
  if (!isIsoDate(input.date)) throw new Error("Enter a valid date");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  // Checked here as well as in the database so the user gets a readable message
  // instead of a raw SQLite foreign-key error.
  const category = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
  if (!category) throw new Error("Select a category");
  if (category.type !== input.type) {
    const article = category.type === "INCOME" ? "an" : "a";
    throw new Error(`"${category.name}" is ${article} ${category.type.toLowerCase()} category`);
  }
}

export function createTransaction(input: TransactionInput): FinancialTransaction {
  assertValidTransaction(input);
  return db
    .insert(financialTransactions)
    .values({
      date: input.date,
      type: input.type,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      description: input.description?.trim() ?? "",
      seasonId: input.seasonId ?? null,
      activityId: input.activityId ?? null,
      paymentMethod: input.paymentMethod ?? "BANK",
      status: input.status ?? "SETTLED",
    })
    .returning()
    .get();
}

export function updateTransaction(id: number, input: TransactionInput): FinancialTransaction {
  assertValidTransaction(input);
  return db
    .update(financialTransactions)
    .set({
      date: input.date,
      type: input.type,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      description: input.description?.trim() ?? "",
      seasonId: input.seasonId ?? null,
      activityId: input.activityId ?? null,
      paymentMethod: input.paymentMethod ?? "BANK",
      status: input.status ?? "SETTLED",
    })
    .where(eq(financialTransactions.id, id))
    .returning()
    .get();
}

export function deleteTransaction(id: number): void {
  db.delete(financialTransactions).where(eq(financialTransactions.id, id)).run();
}

export function getTransaction(id: number): TransactionRow | undefined {
  return listTransactions().find((row) => row.id === id);
}
